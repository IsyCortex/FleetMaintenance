// src/services/workOrderService.js
//
// Workflow logic for work orders.
//
// The database enforces valid status VALUES only (via the work_orders.status
// CHECK constraint). Valid TRANSITIONS are business rules defined here, in a
// single ALLOWED_TRANSITIONS map that acts as the single source of truth.
//
// Concurrency: transition() runs inside a transaction and takes a row lock
// (SELECT ... FOR UPDATE) on the work order before reading its current status.
// This serializes concurrent transitions on the same row: the second caller
// blocks on the lock, then reads the updated status, so two competing
// transitions can never both succeed from the same starting state.

class ErrorWithCode extends Error {
  constructor(message, code) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
  }
}
class InvalidInput extends ErrorWithCode {
  constructor(message) { super(message, "INVALID_INPUT"); }
}
class NotFound extends ErrorWithCode {
  constructor(message) { super(message, "WORK_ORDER_NOT_FOUND"); }
}
class InvalidTransition extends ErrorWithCode {
  constructor(message) { super(message, "INVALID_TRANSITION"); }
}
class IssueNotOpen extends ErrorWithCode {
  constructor(message) { super(message, "ISSUE_NOT_OPEN"); }
}

const ALLOWED_TRANSITIONS = {
  created:     ["in_progress", "cancelled"],
  in_progress: ["completed", "cancelled"],
  completed:   [], // terminal
  cancelled:   [], // terminal
};

function createService(db, pool) {
  async function createWorkOrder({ issueId, assignedTo, notes }) {
    if (!issueId) throw new InvalidInput("issueId is required");

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const issue = await db.workOrders.getIssue(client, issueId);
      if (!issue) {
        // Parent issue missing => surface as a clear conflict.
        throw new IssueNotOpen(`Issue ${issueId} was not found or cannot accept work orders`);
      }
      if (issue.status !== "open")
        throw new IssueNotOpen(
          `Issue ${issueId} is not open (status: ${issue.status}); only open issues accept work orders`
        );

      const workOrder = await db.workOrders.createWorkOrder(
        { issueId, assignedTo, notes },
        client
      );
      await client.query("COMMIT");
      return workOrder;
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  async function transition(workOrderId, newStatus) {
    if (!newStatus) throw new InvalidInput("status is required");
    if (!(newStatus in ALLOWED_TRANSITIONS))
      throw new InvalidInput(`Unknown status: ${newStatus}`);

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Row lock: blocks concurrent transitions on this same work order.
      const current = await db.workOrders.lockWorkOrderForUpdate(client, workOrderId);
      if (!current) throw new NotFound(`Work order ${workOrderId} was not found`);

      const allowed = ALLOWED_TRANSITIONS[current.status] || [];
      if (!allowed.includes(newStatus))
        throw new InvalidTransition(
          `Cannot transition work order ${workOrderId} from '${current.status}' to '${newStatus}'`
        );

      const completedAt =
        newStatus === "completed" ? new Date().toISOString() : null;

      const updated = await db.workOrders.setStatus(client, workOrderId, newStatus, completedAt);
      await client.query("COMMIT");
      return updated;
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  async function listWorkOrders() {
    return db.workOrders.listWorkOrders();
  }

  return { createWorkOrder, transition, listWorkOrders };
}

module.exports = {
  createService,
  InvalidInput,
  NotFound,
  InvalidTransition,
  IssueNotOpen,
  ALLOWED_TRANSITIONS,
};
