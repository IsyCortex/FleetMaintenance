// src/services/reportService.js
//
// Workflow logic for defect reports. The confirm/reject operations use an
// explicit transaction (BEGIN/COMMIT/ROLLBACK) so that creating the Issue and
// changing the report status succeed or fail together (all-or-nothing).
//
// AI submissions go through the same proposal -> confirm path as manual ones:
// the analyzer's output is a suggestion (pending review), never an Issue.

const {
  getAnalyzer,
  validateSuggestion,
  AIAnalysisFailed,
  AIInvalidResponse,
} = require("./aiAnalyzer");

// --- Small error model with machine-readable codes ---------------------
class ErrorWithCode extends Error {
  constructor(message, code) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
  }
}
class InvalidInput extends ErrorWithCode {
  constructor(message) { super(message, "INVALID_INPUT"); }
}
class NotFound extends ErrorWithCode {
  constructor(message) { super(message, "REPORT_NOT_FOUND"); }
}
class StateConflict extends ErrorWithCode {
  constructor(message) { super(message, "REPORT_NOT_PENDING"); }
}

// Neutral suggestion used by the manual path (coordinator will edit on confirm).
const MANUAL_SUGGESTION = {
  category: "other",
  severity: "low",
  summary: "Pending coordinator review.",
};

function createService(db, pool, providedAnalyzer) {
  const analyzer = providedAnalyzer || getAnalyzer();

  // Shared persistence: both manual and AI submissions insert a proposal row.
  async function insertDraft(input, suggestion, rawResponse) {
    return db.defectReports.createReport({
      vehicleId: input.vehicleId,
      rawText: input.rawText,
      reportedByName: input.reportedByName,
      suggestion,
      rawResponse,
    });
  }

  function assertBaseInput(input) {
    if (!input.vehicleId) throw new InvalidInput("vehicleId is required");
    if (!input.rawText || !String(input.rawText).trim())
      throw new InvalidInput("rawText is required");
    if (!input.reportedByName) throw new InvalidInput("reportedByName is required");
  }

  async function submitManualReport(input) {
    assertBaseInput(input);
    return insertDraft(input, MANUAL_SUGGESTION, null);
  }

  async function submitAIReport(input) {
    assertBaseInput(input);

    let suggestion;
    try {
      // The analyzer receives ONLY the report text - never vehicleId or other
      // application data. This structural separation is enforced here.
      suggestion = await analyzer.analyze(input.rawText);
    } catch (err) {
      // If the analyzer itself already reported an invalid contract, let that
      // propagate as-is; otherwise treat the throw as an unavailable analyzer.
      if (err instanceof AIInvalidResponse) throw err;
      throw new AIAnalysisFailed(
        `Report analysis failed: ${err && err.message ? err.message : "unknown analyzer error"}`
      );
    }

    // Defense in depth: enforce the contract even if an analyzer does not
    // self-validate, so invalid suggestions can never be persisted.
    // Throws AIInvalidResponse on a bad shape.
    suggestion = validateSuggestion(suggestion);

    // Fail-fast: never insert a placeholder-filled report from bad AI output.
    // rawResponse stores the analyzer's output verbatim (Option A).
    return insertDraft(input, suggestion, suggestion);
  }

  async function confirmReport(reportId, approved, confirmedByName) {
    if (!approved) throw new InvalidInput("category, severity, and summary are required");
    for (const k of ["category", "severity", "summary"])
      if (!approved[k]) throw new InvalidInput(`${k} is required`);
    if (!confirmedByName) throw new InvalidInput("confirmedByName is required");

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const report = await db.defectReports.getReport(client, reportId);
      if (!report) throw new NotFound(`Report ${reportId} was not found`);
      if (report.status !== "pending_review")
        throw new StateConflict(
          `Report ${reportId} is not pending review (status: ${report.status})`
        );

      const issue = await db.issues.createIssue(client, {
        defectReportId: reportId,
        ...approved,
        confirmedByName,
      });
      await db.defectReports.setStatus(client, reportId, "confirmed");

      await client.query("COMMIT");
      return issue;
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  async function rejectReport(reportId) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const report = await db.defectReports.getReport(client, reportId);
      if (!report) throw new NotFound(`Report ${reportId} was not found`);
      if (report.status !== "pending_review")
        throw new StateConflict(
          `Report ${reportId} is not pending review (status: ${report.status})`
        );

      await db.defectReports.setStatus(client, reportId, "rejected");
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  async function listPendingReports() {
    return db.defectReports.listPendingReports();
  }

  return {
    submitManualReport,
    submitAIReport,
    confirmReport,
    rejectReport,
    listPendingReports,
  };
}

module.exports = {
  createService,
  InvalidInput,
  NotFound,
  StateConflict,
  AIAnalysisFailed,
  AIInvalidResponse,
};
