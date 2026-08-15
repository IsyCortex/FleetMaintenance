// src/app.js
//
// Builds and returns the Express application (middleware + routes).
// Kept separate from server.js so the app can be tested without
// actually listening on a port.

const path = require("node:path");
const express = require("express");
const db = require("./db");
const pool = require("./db/pool");
const { createApiRouter: reportsRouter } = require("./routes/reports");
const { createApiRouter: workOrdersRouter } = require("./routes/workOrders");
const { createReviewRouter } = require("./routes/review");
const { createWorkOrdersBrowserRouter } = require("./routes/workOrdersBrowser");

function createApp() {
  const app = express();

  // View layer (browser UI) ---------------------------------------------
  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "..", "views"));
  app.use(express.static(path.join(__dirname, "..", "public")));

  app.use(express.json()); // parse JSON request bodies

  // Health check: a cheap way to confirm the server is up.
  app.get("/api/health", (req, res) => {
    res.status(200).json({
      status: "ok",
      service: "fleet-maintenance",
      time: new Date().toISOString(),
    });
  });

  // API (JSON) - the existing workflow surface ---------------------------
  app.use("/api", reportsRouter({ db, pool }));
  app.use("/api", workOrdersRouter({ db, pool }));

  // Browser (HTML) - thin rendering over the existing services/APIs -------
  app.use(createReviewRouter({ db, pool }));

  // Browser (HTML) - work-order overview (TICKET-8)
  app.use("/work-orders", createWorkOrdersBrowserRouter({ db, pool }));

  return app;
}

module.exports = { createApp };
