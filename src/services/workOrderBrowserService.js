// src/services/workOrderBrowserService.js
// Minimal service for the browser-based work-order overview (TICKET-8).
// Provides eligible open issues (no existing work order) to the view layer.
// The db object is the aggregated module from src/db/index.js, which has
// shape: { vehicles, defectReports, issues, workOrders }.
async function getEligibleIssues(db, pool) {
  const client = await pool.connect();
  try {
    // getEligibleIssues is exported from src/db/workOrders.js
    const issues = await db.workOrders.getEligibleIssues(client);
    return issues;
  } finally {
    client.release();
  }
}

module.exports = { getEligibleIssues };