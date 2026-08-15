// src/routes/workOrdersBrowser.js
// Browser route for the work-order overview (TICKET-8).
// Renders the /work-orders page with eligible issues and a create form.
// Creation uses the existing TICKET-4 API; no business logic in the route.

const express = require("express");
const { getEligibleIssues } = require("../services/workOrderBrowserService");

function createWorkOrdersBrowserRouter({ db, pool }) {
  const router = express.Router();
  router.get("/", async (req, res, next) => {
    try {
      const issues = await getEligibleIssues(db, pool);
      res.render("work-orders/overview", { issues });
    } catch (err) {
      next(err);
    }
  });
  return router;
}

module.exports = { createWorkOrdersBrowserRouter };