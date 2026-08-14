// src/db/pool.js
// A single shared PostgreSQL connection pool, configured from our central
// config module (which reads DATABASE_URL from the environment / .env).
// Every db/*.js module uses this pool so we don't open a new connection
// per query.

const { Pool } = require("pg");
const config = require("../config");

const pool = new Pool({
  connectionString: config.databaseUrl,
});

module.exports = pool;
