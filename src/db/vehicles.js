// src/db/vehicles.js
// Data access for the vehicles table (raw parameterized SQL via the shared pool).

const pool = require("./pool");

async function listVehicles() {
  const { rows } = await pool.query(
    "SELECT id, label, license_plate FROM vehicles ORDER BY label"
  );
  return rows;
}

module.exports = { listVehicles };
