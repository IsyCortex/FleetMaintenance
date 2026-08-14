// tests/workOrderService.test.js
//
// Unit tests for the work-order workflow (services/workOrderService.js).
// Uses a fake pool + fake db so no real database connection is required.
// Run with: node --test tests/workOrderService.test.js

const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  createService,
  InvalidInput,
  NotFound,
  InvalidTransition,
  IssueNotOpen,
} = require("../src/services/workOrderService");

// A fake db module that records the calls the service makes.
function makeFakeDb(overrides = {}) {
  const state = {
    issue: { id: 1, status: "open", ...overrides.issue },
    woId: 10,
    woStatus: "created",
    completedAt: null,
    lockCalls: 0,
    updates: [],
    created: null,
  };

  const db = {
    workOrders: {
      getIssue: async (client, id) =>
        id === state.issue.id ? { ...state.issue } : null,
      createWorkOrder: async (input, client) => {
        state.created = { id: 10, status: "created", ...input };
        return { ...state.created };
      },
      lockWorkOrderForUpdate: async (client, id) => {
        state.lockCalls += 1;
        state.lockSql = "SELECT id, status, completed_at FROM work_orders WHERE id = $1 FOR UPDATE";
        const row = { id, status: state.woStatus, completed_at: state.completedAt };
        // returning a reference-bearing object is fine; tests use primitive props
        return (id === state.woId) ? { ...row } : null;
      },
      setStatus: async (client, id, status, completedAt) => {
        state.woStatus = status;
        state.completedAt = completedAt;
        state.updates.push({ id, status, completedAt });
        return { id, status, completed_at: completedAt };
      },
      listWorkOrders: async () => [],
    },
  };
  return { db, state };
}

function makeFakePool() {
  const state = { commands: [], released: false, connectCalls: 0 };
  const client = {
    query: async (sql) => {
      state.commands.push(sql);
      return { rows: [] };
    },
    release: () => { state.released = true; },
  };
  const pool = {
    state,
    client,
    connect: async () => {
      state.connectCalls += 1;
      return client;
    },
  };
  return pool;
}

function fresh() {
  const { db, state } = makeFakeDb();
  const pool = makeFakePool();
  return { service: createService(db, pool), db, state, pool };
}

test("createWorkOrder: requires an open issue and creates a 'created' work order", async () => {
  const { service, state, pool } = fresh();
  const wo = await service.createWorkOrder({ issueId: 1, assignedTo: "Bob", notes: "n" });

  assert.equal(wo.id, 10);
  assert.equal(wo.status, "created");
  assert.equal(state.issue.status, "open");
  assert.ok(pool.state.commands.includes("BEGIN"));
  assert.ok(pool.state.commands.includes("COMMIT"));
  assert.ok(pool.state.released);
});

test("createWorkOrder: rejects with ISSUE_NOT_OPEN when the issue is not open", async () => {
  const { db, state } = makeFakeDb({ issue: { id: 1, status: "closed" } });
  const pool = makeFakePool();
  const service = createService(db, pool);

  await assert.rejects(
    service.createWorkOrder({ issueId: 1, assignedTo: "Bob" }),
    (err) => err instanceof IssueNotOpen && err.code === "ISSUE_NOT_OPEN"
  );
  assert.equal(state.created, null, "must not create a work order");
  assert.ok(pool.state.commands.includes("ROLLBACK"));
});

test("transition: moves created -> in_progress with no completed_at", async () => {
  const { service, state, pool } = fresh();
  const wo = await service.transition(10, "in_progress");

  assert.equal(wo.status, "in_progress");
  assert.equal(wo.completed_at, null);
  assert.equal(state.lockCalls, 1, "must lock the row first");
  // the lock helper must use a row-level FOR UPDATE lock
  assert.ok(/FOR UPDATE/.test(state.lockSql || ""), "expected FOR UPDATE lock");
  assert.ok(pool.state.commands.includes("COMMIT"));
});

test("transition: to 'completed' sets completed_at", async () => {
  const { db, state } = makeFakeDb();
  state.woStatus = "in_progress";
  const pool = makeFakePool();
  const service = createService(db, pool);

  const wo = await service.transition(10, "completed");
  assert.equal(wo.status, "completed");
  assert.ok(wo.completed_at, "completed_at should be populated");
});

test("transition: rejects with INVALID_TRANSITION for an illegal jump (created -> completed)", async () => {
  const { service, pool } = fresh();
  await assert.rejects(
    service.transition(10, "completed"),
    (err) => err instanceof InvalidTransition && err.code === "INVALID_TRANSITION"
  );
  assert.ok(pool.state.commands.includes("ROLLBACK"));
});

test("transition: rejects with INVALID_TRANSITION when moving from a terminal state", async () => {
  const { db, state } = makeFakeDb();
  state.woStatus = "completed";
  const pool = makeFakePool();
  const service = createService(db, pool);

  await assert.rejects(
    service.transition(10, "in_progress"),
    (err) => err instanceof InvalidTransition && err.code === "INVALID_TRANSITION"
  );
});

test("transition: rejects with WORK_ORDER_NOT_FOUND for a missing work order", async () => {
  const { service, pool } = fresh();
  await assert.rejects(
    service.transition(99, "in_progress"),
    (err) => err instanceof NotFound && err.code === "WORK_ORDER_NOT_FOUND"
  );
  assert.ok(pool.state.commands.includes("ROLLBACK"));
  assert.equal(pool.state.commands.includes("COMMIT"), false);
});
