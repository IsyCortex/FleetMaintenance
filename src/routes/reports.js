// src/routes/reports.js
//
// HTTP layer for the defect-report workflow. Routes keep things thin: they
// parse/validate the request, call the service, and translate any domain
// error into the matching HTTP status + machine-readable code.

const express = require("express");
const {
  createService,
  InvalidInput,
  NotFound,
  StateConflict,
  AIAnalysisFailed,
  AIInvalidResponse,
} = require("../services/reportService");

// keep these shared so route handlers and the error middleware agree
const STATUS_BY_ERROR = [
  [InvalidInput, 400],
  [NotFound, 404],
  [StateConflict, 409],
  [AIAnalysisFailed, 502],
  [AIInvalidResponse, 502],
];

function parseId(raw) {
  const n = Number(String(raw || ""));
  return Number.isInteger(n) && n > 0 ? n : null;
}

function createApiRouter({ db, pool }) {
  const service = createService(db, pool);
  const router = express.Router();

  // Helpers -------------------------------------------------------------
  const ok = (res, status) => (body) => res.status(status).json(body);
  const withId = (req, res, next) => {
    const id = parseId(req.params.id);
    if (id === null) return res.status(400).json({ code: "INVALID_INPUT", message: "Invalid report id" });
    req.reportId = id;
    next();
  };

  // Manual creation (no AI) ---------------------------------------------
  router.post("/reports", async (req, res, next) => {
    try {
      const report = await service.submitManualReport({
        vehicleId: parseInt(req.body.vehicleId, 10),
        rawText: req.body.rawText,
        reportedByName: req.body.reportedByName,
      });
      ok(res, 201)({ report });
    } catch (err) { next(err); }
  });

  // AI-assisted creation (FakeAIAnalyzer for now) -------------------------
  router.post("/reports/ai", async (req, res, next) => {
    try {
      const report = await service.submitAIReport({
        vehicleId: parseInt(req.body.vehicleId, 10),
        rawText: req.body.rawText,
        reportedByName: req.body.reportedByName,
      });
      ok(res, 201)({ report });
    } catch (err) { next(err); }
  });

  // Review list ----------------------------------------------------------
  router.get("/reports/pending", async (req, res, next) => {
    try {
      ok(res, 200)({ reports: await service.listPendingReports() });
    } catch (err) { next(err); }
  });

  // Confirm -> creates an Issue (transaction in the service) --------------
  router.post("/reports/:id/confirm", withId, async (req, res, next) => {
    try {
      const issue = await service.confirmReport(
        req.reportId,
        {
          category: req.body.category,
          severity: req.body.severity,
          summary: req.body.summary,
        },
        req.body.confirmedByName
      );
      ok(res, 201)({ issue });
    } catch (err) { next(err); }
  });

  // Reject -> marks report rejected ---------------------------------------
  router.post("/reports/:id/reject", withId, async (req, res, next) => {
    try {
      await service.rejectReport(req.reportId);
      ok(res, 200)({ ok: true });
    } catch (err) { next(err); }
  });

  // Error middleware: translate domain errors -> HTTP + machine-readable code
  router.use((err, req, res, next) => {
    for (const [Err, status] of STATUS_BY_ERROR) {
      if (err instanceof Err)
        return res.status(status).json({ code: err.code, message: err.message });
    }
    console.error("Unhandled error:", err);
    return res.status(500).json({ code: "INTERNAL_ERROR", message: "Unexpected error" });
  });

  return router;
}

module.exports = { createApiRouter };
