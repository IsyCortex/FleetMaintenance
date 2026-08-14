// db/setup.js
//
// Applies db/schema.sql and db/seed.sql against the configured database.
// Run with:        npm run db:setup
//
// Uses the same `pg` driver and DATABASE_URL config as the application, so
// there is a single consistent way to talk to the local database.

const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { Client } = require("pg");
const config = require("../src/config");

async function main() {
  const schemaSql = readFileSync(join(__dirname, "schema.sql"), "utf8");
  const seedSql = readFileSync(join(__dirname, "seed.sql"), "utf8");

  const client = new Client({ connectionString: config.databaseUrl });

  try {
    await client.connect();
    console.log(`Connected to ${config.databaseUrl.split("@")[1] || config.databaseUrl}`);

    // Multiple statements per query call are allowed by `pg` (simple protocol).
    await client.query(schemaSql);
    console.log("Applied db/schema.sql");

    await client.query(seedSql);
    console.log("Applied db/seed.sql");

    console.log("Database setup complete.");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("Database setup failed:", err.message);
  console.error(
    "Is PostgreSQL running? (Local dev: `docker compose up -d`)"
  );
  process.exitCode = 1;
});