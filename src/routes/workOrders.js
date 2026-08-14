// src/routes/workOrders.js
// HTTP layer for the work-order workflow. Thin routes: parse/validate the
// request, call the service, translate domain errors to HTTP + code.

const express = require("express");
const {
  createService,
  InvalidInput,
  NotFound,
  InvalidTransition,
  IssueNotOpen,
} = require("../services/workOrderService");

const STATUS_BY_ERROR = [
  [InvalidInput, 400],
  [NotFound, 404],
  [InvalidTransition, 409],
  [IssueNotOpen, 409],
];

function parseId(raw) {
  const n = Number(String(raw || ""));
  return Number.isInteger(n) && n > 0 ? n : null;
}

function createApiRouter({ db, pool }) {
  const service = createService(db, pool);
  const router = express.Router();

  const withId = (req, res, next) => {
    const id = parseId(req.params.id);
    if (id === null)
      return res.status(400).json({ code: "INVALID_INPUT", message: "Invalid work order id" });
    req.workOrderId = id;
    next();
  };

  // Create a work order from an open issue -------------------------------
  router.post("/work-orders", async (req, res, next) => {
    try {
      const workOrder = await service.createWorkOrder({
        issueId: parseInt(req.body.issueId, 10),
        assignedTo: req.body.assignedTo,
        notes: req.body.notes,
      });
      res.status(201).json({ workOrder });
    } catch (err) { next(err); }
  });

  // List ------------------------------------------------------------------
  router.get("/work-orders", async (req, res, next) => {
    try {
      res.json({ workOrders: await service.listWorkOrders() });
    } catch (err) { next(err); }
  });

  // Generic transition ({ status }) ----------------------------------------
  router.post("/work-orders/:id/transition", withId, async (req, res, next) => {
    try {
      const workOrder = await service.transition(req.workOrderId, req.body.status);
      res.json({ workOrder });
    } catch (err) { next(err); }
  });

  // Error middleware -------------------------------------------------------
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
