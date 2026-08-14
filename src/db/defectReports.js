// src/db/defectReports.js
// Data access for the defect_reports table.
//
// A report carries ai_suggested_* fields (a PROPOSAL) plus the raw analyzer
// output (ai_raw_response). The coordinator confirms the report to create an
// Issue; the AI never creates an Issue directly.

const pool = require("./pool");

// Neutral defaults used by the MANUAL (no-AI) submission path.
const MANUAL_SUGGESTION = {
  category: "other",
  severity: "low",
  summary: "Pending coordinator review.",
};

// Suggestion = { category, severity, summary }; rawResponse = the analyzer's
// verbatim output (stored as-is), or null for the manual path.
async function createReport({ vehicleId, rawText, reportedByName, suggestion, rawResponse }) {
  const s = suggestion || MANUAL_SUGGESTION;
  const sql = `
    INSERT INTO defect_reports
      (vehicle_id, raw_text, reported_by_name, status,
       ai_suggested_category, ai_suggested_severity, ai_suggested_summary,
       ai_raw_response)
    VALUES ($1, $2, $3, 'pending_review', $4, $5, $6, $7)
    RETURNING id, vehicle_id, raw_text, reported_by_name, reported_at, status`;
  const { rows } = await pool.query(sql, [
    vehicleId,
    rawText,
    reportedByName,
    s.category,
    s.severity,
    s.summary,
    rawResponse ?? null,
  ]);
  return rows[0];
}

// Runs inside the caller's transaction (client must be the tx client).
async function getReport(client, reportId) {
  const { rows } = await client.query(
    "SELECT id, vehicle_id, status FROM defect_reports WHERE id = $1",
    [reportId]
  );
  return rows[0] || null;
}

async function listPendingReports() {
  const { rows } = await pool.query(
    `SELECT dr.id, dr.vehicle_id, dr.raw_text, dr.reported_by_name, dr.reported_at,
            v.label AS vehicle_label,
            dr.ai_suggested_category, dr.ai_suggested_severity, dr.ai_suggested_summary
       FROM defect_reports dr
       JOIN vehicles v ON v.id = dr.vehicle_id
      WHERE dr.status = 'pending_review'
      ORDER BY dr.reported_at DESC`
  );
  return rows;
}

// Runs inside the caller's transaction (client must be the tx client).
async function setStatus(client, reportId, status) {
  await client.query(
    "UPDATE defect_reports SET status = $2 WHERE id = $1",
    [reportId, status]
  );
}

module.exports = { createReport, getReport, listPendingReports, setStatus };
