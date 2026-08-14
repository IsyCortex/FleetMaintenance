// src/services/aiAnalyzer.js
//
// The application-facing interface for AI analysis, plus the composition
// root (getAnalyzer) that selects the concrete provider implementation.
//
// CONTRACT:
//     analyze(rawText) -> Promise<{ category, severity, summary }>
//
// The analyzer receives ONLY the report text. It must NEVER be given
// application/domain data such as vehicleId. Its output is a PROPOSAL: it is
// persisted as ai_suggested_* on a defect_reports row that the coordinator
// still must confirm before an Issue can exist.
//
// Allowed values mirror the database CHECK constraints.
const VALID_CATEGORIES = ["mechanical", "electrical", "body", "safety", "other"];
const VALID_SEVERITIES = ["low", "medium", "high", "critical"];

class ErrorWithCode extends Error {
  constructor(message, code) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
  }
}

// The analyzer call itself threw / was unavailable.
class AIAnalysisFailed extends ErrorWithCode {
  constructor(message) { super(message, "AI_ANALYSIS_FAILED"); }
}

// The analyzer returned data that does not satisfy the contract.
class AIInvalidResponse extends ErrorWithCode {
  constructor(message) { super(message, "AI_INVALID_RESPONSE"); }
}

// Throws AIInvalidResponse if the suggestion does not match the contract.
// Used both as a self-check inside analyzers and, optionally, as defense in
// depth by the service.
function validateSuggestion(input) {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new AIInvalidResponse("analyzer returned a non-object suggestion");

  if (!VALID_CATEGORIES.includes(input.category))
    throw new AIInvalidResponse(`analyzer returned invalid category: '${input.category}'`);

  if (!VALID_SEVERITIES.includes(input.severity))
    throw new AIInvalidResponse(`analyzer returned invalid severity: '${input.severity}'`);

  if (typeof input.summary !== "string" || input.summary.trim().length === 0)
    throw new AIInvalidResponse("analyzer returned empty summary");
  if (input.summary.length > 500)
    throw new AIInvalidResponse("analyzer summary exceeds 500 characters");

  return input;
}

// Composition root: the ONE place that knows which providers exist.
// Swapping providers (e.g. to a local LLM later) is a config change here.
function getAnalyzer() {
  switch (process.env.AI_PROVIDER || "fake") {
    case "fake":
      return require("./analyzers/fakeAnalyzer");
    // case "local": return require("./analyzers/localAnalyzer"); // TICKET-6+
    default:
      // Safe fallback: unknown provider -> deterministic fake.
      return require("./analyzers/fakeAnalyzer");
  }
}

module.exports = {
  getAnalyzer,
  validateSuggestion,
  AIAnalysisFailed,
  AIInvalidResponse,
  VALID_CATEGORIES,
  VALID_SEVERITIES,
};
