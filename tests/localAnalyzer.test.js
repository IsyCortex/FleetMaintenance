// tests/localAnalyzer.test.js
//
// Unit tests for the local (Ollama) analyzer. The HTTP layer is stubbed, so the
// automated test suite never needs a live model or LAN connection.
// Run with: node --test tests/localAnalyzer.test.js

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createLocalAnalyzer } = require("../src/services/analyzers/localAnalyzer");
const { AIAnalysisFailed, AIInvalidResponse } = require("../src/services/aiAnalyzer");

const URL = "http://localhost:11434";
const MODEL = "qwen3:30b-a3b";

// Build a fake fetch that returns a canned HTTP Response.
function fakeOk(input) {
  return async (url, init) => ({
    ok: true,
    status: 200,
    statusText: "OK",
    json: async () => input,
  });
}

function ollamaRes(content, extra = {}) {
  return {
    model: MODEL,
    message: { role: "assistant", content, ...extra },
    done: true,
    total_duration: 112_538_807_949,
  };
}

test("localAnalyzer: posts an Ollama /api/chat request; user message is exactly rawText", async () => {
  let captured = null;
  const fetchImpl = async (url, init) => {
    captured = { url, init };
    const opts = JSON.parse(init.body);
    return {
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () =>
        ollamaRes(
          JSON.stringify({ category: "mechanical", severity: "high", summary: "Brake fault" }),
          { thinking: "some reasoning" }
        ),
    };
  };

  const analyzer = createLocalAnalyzer({ ollamaUrl: URL, model: MODEL, fetchImpl });
  const rawText = "The brakes feel spongy and the pedal goes far down.";
  const out = await analyzer.analyze(rawText);

  // request shape
  assert.equal(captured.url, `${URL}/api/chat`);
  assert.equal(captured.init.method, "POST");
  const body = JSON.parse(captured.init.body);
  assert.equal(body.model, MODEL);
  assert.equal(body.stream, false);
  assert.equal(body.format, "json");
  assert.equal(body.messages.length, 2);
  assert.equal(body.messages[0].role, "system");
  assert.equal(body.messages[1].role, "user");
  assert.equal(
    body.messages[1].content,
    rawText,
    "user message must be exactly rawText (text-only boundary)"
  );

  // parsed + validated contract output
  assert.deepEqual(out, { category: "mechanical", severity: "high", summary: "Brake fault" });
});

test("localAnalyzer: ignores message.thinking / extra metadata", async () => {
  const analyzer = createLocalAnalyzer({
    ollamaUrl: URL,
    model: MODEL,
    fetchImpl: fakeOk(
      ollamaRes(
        JSON.stringify({ category: "electrical", severity: "medium", summary: "ABS light" }),
        { thinking: "chain of thought...", images: [] }
      )
    ),
  });
  const out = await analyzer.analyze("ABS light stays on");
  assert.deepEqual(out, { category: "electrical", severity: "medium", summary: "ABS light" });
});

test("localAnalyzer: rejects off-contract enum values (e.g. 'Brakes'/'Critical') with AIInvalidResponse", async () => {
  // Exactly the failure mode we observed live: capitalized non-enum labels.
  const analyzer = createLocalAnalyzer({
    ollamaUrl: URL,
    model: MODEL,
    fetchImpl: fakeOk(
      ollamaRes(
        JSON.stringify({ category: "Brakes", severity: "Critical", summary: "Spongy pedal" })
      )
    ),
  });
  await assert.rejects(
    analyzer.analyze("spongy brake pedal"),
    (err) => err instanceof AIInvalidResponse && err.code === "AI_INVALID_RESPONSE"
  );
});

test("localAnalyzer: rejects malformed (non-JSON) content with AIInvalidResponse", async () => {
  const analyzer = createLocalAnalyzer({
    ollamaUrl: URL,
    model: MODEL,
    fetchImpl: fakeOk(ollamaRes("not-json-at-all")),
  });
  await assert.rejects(
    analyzer.analyze("hello"),
    (err) => err instanceof AIInvalidResponse && err.code === "AI_INVALID_RESPONSE"
  );
});

test("localAnalyzer: throws AIAnalysisFailed on transport failure (network error)", async () => {
  const analyzer = createLocalAnalyzer({
    ollamaUrl: URL,
    model: MODEL,
    fetchImpl: async () => {
      throw new Error("ECONNREFUSED");
    },
  });
  await assert.rejects(
    analyzer.analyze("any text"),
    (err) => err instanceof AIAnalysisFailed && err.code === "AI_ANALYSIS_FAILED"
  );
});

test("localAnalyzer: throws AIAnalysisFailed on HTTP error status", async () => {
  const analyzer = createLocalAnalyzer({
    ollamaUrl: URL,
    model: MODEL,
    fetchImpl: async () => ({ ok: false, status: 503, statusText: "Unavailable" }),
  });
  await assert.rejects(
    analyzer.analyze("any text"),
    (err) => err instanceof AIAnalysisFailed && err.code === "AI_ANALYSIS_FAILED"
  );
});

test("localAnalyzer: throws AIAnalysisFailed when message.content is missing", async () => {
  const analyzer = createLocalAnalyzer({
    ollamaUrl: URL,
    model: MODEL,
    fetchImpl: fakeOk({ done: true }), // no message field
  });
  await assert.rejects(
    analyzer.analyze("any text"),
    (err) => err instanceof AIAnalysisFailed && err.code === "AI_ANALYSIS_FAILED"
  );
});

test("localAnalyzer: applies a timeout signal only when timeoutMs > 0", async () => {
  let initSeen = null;
  const gotime = createLocalAnalyzer({
    ollamaUrl: URL,
    model: MODEL,
    timeoutMs: 300000,
    fetchImpl: async (url, init) => {
      initSeen = init;
      return {
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () =>
          ollamaRes(JSON.stringify({ category: "other", severity: "low", summary: "x" })),
      };
    },
  });
  await gotime.analyze("whatever");
  assert.ok(initSeen.signal instanceof AbortSignal, "timeout set -> signal present");

  const noTimeout = createLocalAnalyzer({
    ollamaUrl: URL,
    model: MODEL,
    timeoutMs: 0,
    fetchImpl: async (url, init) => {
      assert.equal(init.signal, undefined, "timeout 0 -> no signal");
      return { ok: true, status: 200, statusText: "OK", json: async () => ollamaRes(JSON.stringify({ category: "other", severity: "low", summary: "x" })) };
    },
  });
  await noTimeout.analyze("whatever");
});
