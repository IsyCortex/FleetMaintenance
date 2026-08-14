// src/db/index.js
// Convenience aggregator so callers can pass the whole db module set around.

module.exports = {
  vehicles: require("./vehicles"),
  defectReports: require("./defectReports"),
  issues: require("./issues"),
  workOrders: require("./workOrders"),
};
