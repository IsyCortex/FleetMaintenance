// src/db/issues.js
// Data access for the issues table. An issue is only ever created inside a
// transaction while a defect report is being confirmed (see reportService).

async function createIssue(client, { defectReportId, category, severity, summary, confirmedByName }) {
  const sql = `
    INSERT INTO issues (defect_report_id, category, severity, summary, confirmed_by_name, status)
    VALUES ($1, $2, $3, $4, $5, 'open')
    RETURNING id, defect_report_id, category, severity, summary,
              confirmed_by_name, confirmed_at, status`;
  const { rows } = await client.query(
    sql,
    [defectReportId, category, severity, summary, confirmedByName]
  );
  return rows[0];
}

module.exports = { createIssue };
