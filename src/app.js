// src/app.js
//
// Builds and returns the Express application (middleware + routes).
// Kept separate from server.js so the app can be tested without
// actually listening on a port.

const express = require("express");
const db = require("./db");
const pool = require("./db/pool");
const { createApiRouter: reportsRouter } = require("./routes/reports");
const { createApiRouter: workOrdersRouter } = require("./routes/workOrders");

function createApp() {
  const app = express();

  app.use(express.json()); // parse JSON request bodies

  // Health check: a cheap way to confirm the server is up.
  app.get("/api/health", (req, res) => {
    res.status(200).json({
      status: "ok",
      service: "fleet-maintenance",
      time: new Date().toISOString(),
    });
  });

  app.use("/api", reportsRouter({ db, pool }));
  app.use("/api", workOrdersRouter({ db, pool }));

  return app;
}

module.exports = { createApp };
