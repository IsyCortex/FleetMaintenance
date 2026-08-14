// config.js
//
// Single place that reads environment-dependent settings.
// Every other module imports this file instead of touching process.env directly,
// so the app is not hardcoded to localhost - moving it to another machine later
// is just a change to the .env file, not to application code.
//
// Defaults below are tuned for the local development setup described in
// docker-compose.yml and .env.example.

module.exports = {
  port: Number(process.env.PORT) || 3000,
  databaseUrl:
    process.env.DATABASE_URL ||
    "postgres://fleet:fleet@localhost:5432/fleetmaintenance",
  aiProvider: process.env.AI_PROVIDER || "fake",
};
