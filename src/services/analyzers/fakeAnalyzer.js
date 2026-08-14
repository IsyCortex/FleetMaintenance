// src/services/analyzers/fakeAnalyzer.js
//
// A deliberately simple, deterministic analyzer used for local demos and for
// unit/integration testing, so tests never need to invoke a real LLM. It stays
// in the codebase even after a local analyzer is added.
//
// This is NOT meant to simulate a sophisticated LLM. It applies a tiny set of
// keyword rules to the text and always returns the same output for the same
// input. Its output is stored verbatim as ai_raw_response.

const { validateSuggestion } = require("../aiAnalyzer");

const name = "fake";

// First matching keyword wins; order matters (most specific first).
const CATEGORY_RULES = [
  { category: "safety", keywords: ["airbag", "smoke", "fire", "seatbelt"] },
  { category: "electrical", keywords: ["headlight", "light", "abs", "wiring", "battery"] },
  { category: "body", keywords: ["dent", "scratch", "paint", "seat", "door"] },
  { category: "mechanical", keywords: ["brake", "engine", "knock", "oil", "transmission"] },
  // anything unmatched falls through to "other" below
];

const CRITICAL_KEYWORDS = ["airbag", "smoke", "fire", "seatbelt"];
const HIGH_KEYWORDS = ["brake", "engine", "knock", "leak", "failing"];

function inferCategory(text) {
  for (const rule of CATEGORY_RULES) {
    if (rule.keywords.some((k) => text.includes(k))) return rule.category;
  }
  return "other";
}

function inferSeverity(text) {
  if (CRITICAL_KEYWORDS.some((k) => text.includes(k))) return "critical";
  if (HIGH_KEYWORDS.some((k) => text.includes(k))) return "high";
  return "low";
}

async function analyze(rawText) {
  // A plain analyze() must never receive anything but the report text, and it
  // must tolerate robustly malformed input for the sake of the demo.
  const text = String(rawText || "").toLowerCase();

  const category = inferCategory(text);
  const severity = inferSeverity(text);
  const summary =
    category === "other"
      ? "No specific fault signature detected; manual review recommended."
      : `Possible ${category} issue identified by keyword match.`;

  // The output shape matches the DB CHECK constraints and the contract.
  const suggestion = { category, severity, summary };
  return validateSuggestion(suggestion);
}

module.exports = { name, analyze };
