// tests/reportService.test.js
//
// Unit tests for the defect-report workflow (services/reportService.js).
// Uses a fake pool + fake db so no real database connection is required.
// Run with: npm test

const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  createService,
  InvalidInput,
  NotFound,
  StateConflict,
  AIAnalysisFailed,
  AIInvalidResponse,
} = require("../src/services/reportService");
const fakeAnalyzer = require("../src/services/analyzers/fakeAnalyzer");

// A fake db module that records the calls the service makes.
function makeFakeDb(reportOverrides = {}) {
  const state = {
    report: { id: 7, vehicle_id: 1, status: "pending_review", ...reportOverrides },
    createdIssue: null,
    setStatusCalls: [],
    createdReportCount: 0,
    issueCreateCalls: 0,
  };
  const state2 = state;
  const db = {
    defectReports: {
      getReport: async (client, reportId) =>
        (reportId === state.report.id ? { ...state.report } : null),
      setStatus: async (client, reportId, status) => {
        state.setStatusCalls.push({ reportId, status });
      },
      createReport: async (input) => {
        state.createdReportCount = (state.createdReportCount || 0) + 1;
        state.forwardedInput = input;
        return { id: 99, 
          vehicleId: input.vehicleId,
          rawText: input.rawText,
          reportedByName: input.reportedByName,
          status: "pending_review",
          ai_suggested_category: input.suggestion && input.suggestion.category,
          ai_raw_response: input.rawResponse,
        };
      },
      listPendingReports: async () => [
        {
          id: 7, vehicle_id: 1, raw_text: "Brakes feel spongy",
          reported_by_name: "Dana", reported_at: new Date().toISOString(),
          vehicle_label: "Van 1",
          ai_suggested_category: "mechanical",
          ai_suggested_severity: "high",
          ai_suggested_summary: "Possible brake issue",
        },
      ],
    },
    issues: {
      createIssue: async (client, input) => {
        state.issueCreateCalls = (state.issueCreateCalls || 0) + 1;
        if (state.createIssueWillThrow) throw new Error("db down");
        state.createdIssue = { id: 5, ...input };
        return { ...state.createdIssue };
      },
    },
  };
  return { db, state };
}

// A fake pg Pool that exposes a single virtual client and records
// BEGIN / COMMIT / ROLLBACK and release() calls.
function makeFakePool() {
  const state = { commands: [], released: false };
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
    connect: async () => client,
  };
  return pool;
}

const APPROVED = { category: "mechanical", severity: "high", summary: "Brake fault" };
const CONFIRMER = "Coordinator A";

test("confirmReport: creates an issue and confirms the report in one transaction", async () => {
  const { db, state } = makeFakeDb();
  const pool = makeFakePool();
  const service = createService(db, pool);

  const issue = await service.confirmReport(7, APPROVED, CONFIRMER);

  assert.equal(issue.id, 5);
  assert.equal(issue.defectReportId, 7);
  assert.equal(issue.category, "mechanical");
  assert.equal(state.createdIssue.defectReportId, 7);
  assert.deepEqual(state.setStatusCalls, [{ reportId: 7, status: "confirmed" }]);
  // transaction correctness
  assert.ok(pool.state.commands.includes("BEGIN"));
  assert.ok(pool.state.commands.includes("COMMIT"));
  assert.ok(!pool.state.commands.includes("ROLLBACK"));
  assert.ok(pool.state.released, "client should be released");
});

test("confirmReport: rejects with REPORT_NOT_FOUND when the report does not exist", async () => {
  const { db, state } = makeFakeDb();
  const pool = makeFakePool();
  const service = createService(db, pool);

  await assert.rejects(
    service.confirmReport(12345, APPROVED, CONFIRMER),
    (err) => err instanceof NotFound && err.code === "REPORT_NOT_FOUND"
  );
  assert.ok(pool.state.commands.includes("ROLLBACK"));
  assert.equal(state.setStatusCalls.length, 0, "must not change report status");
});

test("confirmReport: rejects with REPORT_NOT_PENDING when the report is already confirmed", async () => {
  const { db } = makeFakeDb({ status: "confirmed" });
  const pool = makeFakePool();
  const service = createService(db, pool);

  await assert.rejects(
    service.confirmReport(7, APPROVED, CONFIRMER),
    (err) => err instanceof StateConflict && err.code === "REPORT_NOT_PENDING"
  );
});

test("confirmReport: rolls back when issue creation fails (all-or-nothing)", async () => {
  const { db, state } = makeFakeDb();
  state.createIssueWillThrow = true;
  const pool = makeFakePool();
  const service = createService(db, pool);

  await assert.rejects(service.confirmReport(7, APPROVED, CONFIRMER), /db down/);

  assert.ok(pool.state.commands.includes("ROLLBACK"));
  assert.ok(!pool.state.commands.includes("COMMIT"), "must not COMMIT on failure");
  // the report must NOT have been flipped to confirmed
  assert.deepEqual(state.setStatusCalls, [], "report status must be unchanged");
  assert.equal(state.createdIssue, null, "no issue row should be created");
});

test("confirmReport: validates that all approved fields and the confirm name are present", async () => {
  const { db } = makeFakeDb();
  const service = createService(db, makeFakePool());

  await assert.rejects(
    service.confirmReport(7, { category: "mechanical" }, CONFIRMER),
    (err) => err instanceof InvalidInput && err.code === "INVALID_INPUT"
  );
  await assert.rejects(
    service.confirmReport(7, APPROVED, ""),
    (err) => err instanceof InvalidInput
  );
});

test("submitManualReport: validates required inputs and forwards to the db layer", async () => {
  const { db } = makeFakeDb();
  const service = createService(db, makeFakePool());

  await assert.rejects(service.submitManualReport({}), (err) =>
    err instanceof InvalidInput && err.code === "INVALID_INPUT"
  );
  const created = await service.submitManualReport({
    vehicleId: 1,
    rawText: "  Engine noise  ",
    reportedByName: "Dana",
  });
  assert.equal(created.id, 99);
  assert.equal(created.vehicleId, 1);
  assert.equal(created.status, "pending_review");
});

// ---------------------------------------------------------------------------
// TICKET-5: AI-assisted submission tests
// ---------------------------------------------------------------------------

test("submitAIReport: analyzer receives ONLY rawText (never vehicleId or domain data)", async () => {
  const { db } = makeFakeDb();
  let receivedArgs = null;
  const spy = {
    name: "spy-analyzer",
    analyze: async (rawText) => {
      receivedArgs = rawText;
      return { category: "mechanical", severity: "high", summary: "Spy summary" };
    },
  };
  const service = createService(db, makeFakePool(), spy);

  const report = await service.submitAIReport({
    vehicleId: 42,
    rawText: "Brakes are spongy",
    reportedByName: "Dana",
  });

  assert.equal(receivedArgs, "Brakes are spongy");
  assert.equal(typeof receivedArgs, "string");
  assert.equal(report.vehicleId, 42, "vehicleId persists on the report");
  assert.equal(report.status, "pending_review");
});

test("submitAIReport: is provider-independent (any valid analyzer works)", async () => {
  const alternateAnalyzer = {
    name: "custom",
    analyze: async () => ({
      category: "electrical",
      severity: "medium",
      summary: "Custom summary",
    }),
  };
  const { db } = makeFakeDb();
  const service = createService(db, makeFakePool(), alternateAnalyzer);

  const report = await service.submitAIReport({
    vehicleId: 3,
    rawText: "Headlight flickers",
    reportedByName: "Alex",
  });
  assert.equal(report.vehicleId, 3);
  assert.equal(report.status, "pending_review");
});

test("fakeAnalyzer: deterministic and maps keywords to categories + no-match -> other/low", async () => {
  // Determinism
  const a = await fakeAnalyzer.analyze("Brakes feel spongy");
  const b = await fakeAnalyzer.analyze("Brakes feel spongy");
  assert.deepEqual(a, b);

  assert.equal((await fakeAnalyzer.analyze("Brakes feel spongy")).category, "mechanical");
  assert.equal((await fakeAnalyzer.analyze("ABS warning light")).category, "electrical");
  assert.equal((await fakeAnalyzer.analyze("Dent on the door")).category, "body");
  assert.equal((await fakeAnalyzer.analyze("Smoke from the engine")).category, "safety");

  const none = await fakeAnalyzer.analyze("Random unrelated content");
  assert.equal(none.category, "other");
  assert.equal(none.severity, "low");

  // output always satisfies the contract
  for (const s of [a, none]) {
    assert.ok(["mechanical", "electrical", "body", "safety", "other"].includes(s.category));
    assert.ok(["low", "medium", "high", "critical"].includes(s.severity));
    assert.ok(typeof s.summary === "string" && s.summary.length > 0 && s.summary.length <= 500);
  }
});

test("submitAIReport: fails fast with AI_ANALYSIS_FAILED when the analyzer throws (nothing persisted)", async () => {
  const { db, state } = makeFakeDb();
  const throwingAnalyzer = {
    name: "broken",
    analyze: async () => { throw new Error("provider unreachable"); },
  };
  const service = createService(db, makeFakePool(), throwingAnalyzer);

  await assert.rejects(
    service.submitAIReport({ vehicleId: 1, rawText: "x", reportedByName: "D" }),
    (err) => err instanceof AIAnalysisFailed && err.code === "AI_ANALYSIS_FAILED"
  );
  assert.equal(state.createdReportCount, 0, "must not persist a report on analyzer failure");
});

test("submitAIReport: fails fast with AI_INVALID_RESPONSE for bad analyzer output", async () => {
  const { db, state } = makeFakeDb();
  const badAnalyzer = {
    name: "bad",
    analyze: async () => ({ category: "bogus", severity: "low", summary: "x" }),
  };
  const service = createService(db, makeFakePool(), badAnalyzer);

  await assert.rejects(
    service.submitAIReport({ vehicleId: 1, rawText: "x", reportedByName: "D" }),
    (err) => err instanceof AIInvalidResponse && err.code === "AI_INVALID_RESPONSE"
  );
  assert.equal(state.createdReportCount, 0, "must not persist a report on invalid AI output");
});

test("AI submission: creates only a proposal (pending_review) and never an Issue", async () => {
  const { db, state } = makeFakeDb();
  const service = createService(db, makeFakePool());

  const report = await service.submitAIReport({
    vehicleId: 2,
    rawText: "Brakes feel spongy",
    reportedByName: "Dana",
  });
  assert.equal(report.status, "pending_review");
  assert.equal(state.createdIssue, null, "AI must not create an issue");
  assert.equal(state.issueCreateCalls, 0);
});

// ---------------------------------------------------------------------------
// Amendment: GET /api/reports/pending data contract exposes AI proposals
// ---------------------------------------------------------------------------

test("pending reports data contract: exposes the three suggestion fields for review", async () => {
  const { db } = makeFakeDb();
  const service = createService(db, makeFakePool());

  const reports = await service.listPendingReports();
  assert.equal(reports.length, 1);

  const r = reports[0];
  assert.equal(r.ai_suggested_category, "mechanical");
  assert.equal(r.ai_suggested_severity, "high");
  assert.equal(r.ai_suggested_summary, "Possible brake issue");
  assert.ok(r.raw_text, "review surface needs the original report text");
  assert.ok(r.vehicle_label, "review surface needs the vehicle label");

  // Decision: raw analyzer output stays audit/persistence-only, not exposed.
  assert.equal("ai_raw_response" in r, false, "ai_raw_response must not be in the pending data contract");
});
