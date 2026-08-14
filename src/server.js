// server.js
//
// Entry point. Boots the Express app and starts listening on the
// configured port. Run with: npm start   (or: npm run dev)

const { createApp } = require("./app");
const config = require("./config");

const app = createApp();

app.listen(config.port, () => {
  console.log(`Fleet Maintenance listening on http://localhost:${config.port}`);
});