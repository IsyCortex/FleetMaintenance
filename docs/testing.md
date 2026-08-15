# Test Suite Documentation

## Overview

The Fleet Maintenance project includes a focused unit-test suite covering the core service layer. No live database or AI model is required to run tests. Tests use a fake db module and a fake analyzer to isolate business logic.

## Test Files

### tests/reportService.test.js
Tests the defect-report workflow (services/reportService.js). Covers manual report submission with input validation, AI-assisted report submission with contract-enforced suggestions, coordinator confirmation creating an Issue plus report status transition in one transaction, rejection flow, and verification that AI submission creates only a proposal (never an Issue).

### tests/workOrderService.test.js
Tests the work-order workflow (services/workOrderService.js). Covers createWorkOrder requiring an open issue, ISSUE_NOT_OPEN rejection, valid status transitions (created to in_progress, in_progress to completed), INVALID_TRANSITION for illegal jumps and terminal state violations, and WORK_ORDER_NOT_FOUND.

### tests/localAnalyzer.test.js
Tests the fake analyzer (services/analyzers/fakeAnalyzer.js) for deterministic keyword-to-category mapping and no-match returns other/low.

## Running Tests

```
npm test
```

This runs: node --test tests/reportService.test.js tests/workOrderService.test.js tests/localAnalyzer.test.js

## Test Patterns

### Fake DB Module
Each service test creates a fake db object with stubbed functions mirroring the real DB layer interface. The fake records calls for assertions and simulates transactional flow without a real database.

### Fake Analyzer
Provides deterministic category/severity/summary suggestions based on keyword matching, enabling AI-related tests without a live LLM.

### Transaction Simulation
Tests verify BEGIN/COMMIT/ROLLBACK sequences are called correctly, simulating transactional behavior without real DB locks.

## Coverage Gaps

Out of scope for this prototype:
- No HTTP-level integration tests (routes tested via unit-level service tests)
- No browser E2E tests
- No database migration tests
- No performance/load tests
