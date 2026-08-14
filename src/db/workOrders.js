// src/db/workOrders.js
// Data access for the work_orders table.
//
// The transition helpers take a `client` (a connection that is already inside a
// transaction) because transition() must lock the row and update it atomically.

const pool = require("./pool");

// Used by createWorkOrder: confirm the parent issue exists and is open.
async function getIssue(client, issueId) {
  const { rows } = await client.query(
    "SELECT id, status FROM issues WHERE id = $1",
    [issueId]
  );
  return rows[0] || null;
}

async function createWorkOrder({ issueId, assignedTo, notes }, client) {
  const sql = `
    INSERT INTO work_orders (issue_id, assigned_to, status, notes, created_at)
    VALUES ($1, $2, 'created', $3, now())
    RETURNING id, issue_id, assigned_to, status, notes, created_at, completed_at`;
  const { rows } = await client.query(sql, [issueId, assignedTo ?? null, notes ?? null]);
  return rows[0];
}

async function listWorkOrders() {
  const { rows } = await pool.query(
    `SELECT wo.id, wo.issue_id, wo.assigned_to, wo.status, wo.notes,
            wo.created_at, wo.completed_at,
            i.category, i.severity, i.summary,
            dr.vehicle_id, v.label AS vehicle_label
       FROM work_orders wo
       JOIN issues i ON i.id = wo.issue_id
       JOIN defect_reports dr ON dr.id = i.defect_report_id
       JOIN vehicles v ON v.id = dr.vehicle_id
      ORDER BY wo.created_at DESC`
  );
  return rows;
}

// Lock the row for the duration of the transaction so concurrent transitions
// serialize on this row (SELECT ... FOR UPDATE). Returns the current state.
async function lockWorkOrderForUpdate(client, workOrderId) {
  const { rows } = await client.query(
    "SELECT id, status, completed_at FROM work_orders WHERE id = $1 FOR UPDATE",
    [workOrderId]
  );
  return rows[0] || null;
}

// Update the work order's status, and its completed_at when it becomes
// 'completed'. completed is terminal, so completed_at is never cleared here.
async function setStatus(client, workOrderId, status, completedAt) {
  const sql = `
    UPDATE work_orders
       SET status = $2,
           completed_at = $3
     WHERE id = $1
    RETURNING id, issue_id, assigned_to, status, notes, created_at, completed_at`;
  const { rows } = await client.query(sql, [workOrderId, status, completedAt]);
  return rows[0];
}

module.exports = { getIssue, createWorkOrder, listWorkOrders, lockWorkOrderForUpdate, setStatus };
