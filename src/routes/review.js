// src/routes/review.js
//
// BROWSER routes for the coordinator review UI (TICKET-7). This is a thin
// rendering layer ONLY: it calls the existing report service to fetch data and
// renders EJS templates. It contains ZERO business/workflow logic - confirmation
// and rejection actions are performed by the existing /api routes via the
// review.js client script, preserving the API/service semantics.

const express = require("express");
const { createService: createReportService } = require("../services/reportService");

function createReviewRouter({ db, pool }) {
  const reportService = createReportService(db, pool);
  const router = express.Router();

  // Review page: pending reports + their AI proposals, confirm/reject.
  router.get("/reports/review", async (req, res, next) => {
    try {
      const reports = await reportService.listPendingReports();
      res.render("reports/review", {
        title: "Review pending defect reports",
        reports,
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

module.exports = { createReviewRouter };
