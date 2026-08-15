# Architecture Documentation

## System Overview

Fleet Maintenance is a prototype application demonstrating an AI-assisted fleet maintenance workflow. The system follows a browser to API to DB pattern with a human-in-the-loop constraint at its core: AI output is always a proposal; human confirmation is mandatory before an Issue can exist; status transitions are validated in the service layer.

## Component Boundaries

### 1. Browser / UI Layer
Technology: EJS templates + vanilla JavaScript + plain CSS. No build step. Templates are rendered server-side by Express.

Key pages:
- GET / or GET /work-orders: Work-order overview showing eligible open issues
- GET /reports/review: Coordinator review of pending reports with AI proposals

The UI renders defect reports with AI proposals, provides confirm/reject forms, displays work-order status, and shows inline API errors.

### 2. API Layer
Technology: Express.js middleware. Thin routing layer that parses/validates requests, calls the service layer, and translates domain errors to HTTP + machine-readable codes.

Routers:
- /api/reports: Manual and AI-assisted report creation
- /api/reports/:id/confirm: Confirm report as Issue (transactional)
- /api/reports/:id/reject: Mark report rejected
- /api/reports/pending: List pending reports for coordinator review
- /api/work-orders: Create work order from open Issue
- /api/work-orders/:id/transition: Generic status transition endpoint
- /api/health: Health check

Error middleware maps: InvalidInput 400, NotFound 404, StateConflict 409, InvalidTransition 409, IssueNotOpen 409.

### 3. Service Layer
Technology: Plain JavaScript modules with no framework dependency. Single source of business rules.

Key services:
- reportService: submitManualReport, submitAIReport, confirmReport (transactional), rejectReport, listPendingReports
- workOrderService: createWorkOrder (validates issue is open), transition (enforces ALLOWED_TRANSITIONS, row locking, completed_at), listWorkOrders
- aiAnalyzer: getAnalyzer composition root, validateSuggestion contract check, VALID_CATEGORIES, VALID_SEVERITIES
- workOrderBrowserService: getEligibleIssues (open issues without work orders)

Business rules:
- AI never creates an Issue directly; coordinator confirmation required
- Status transitions: created to [in_progress, cancelled]; in_progress to [completed, cancelled]; completed and cancelled are terminal
- IssueNotOpen error when creating work order on non-open Issue
- InvalidTransition error for illegal status jumps

### 4. Database Layer
Technology: PostgreSQL via pg node-module; raw parameterized SQL; no ORM.

| Table | Primary Key | Key Columns | Notes |
|-------|------------|-------------|-------|
| vehicles | id | label, license_plate | Vehicle registry |
| defect_reports | id | vehicle_id, raw_text, reported_by_name, status, ai_suggested_*, ai_raw_response | Status: pending_review / confirmed / rejected |
| issues | id | defect_report_id, category, severity, summary, status, confirmed_at | Created inside transaction when report confirmed |
| work_orders | id | issue_id, assigned_to, status, notes, created_at, completed_at | Links to Issue; completed_at set only on completed |

### 5. AI Analyzer Layer
Technology: Choice via config (AI_PROVIDER env var).
- fake: deterministic, keyword-based analyzer (default, no network/key)
- local: Ollama-based analyzer via LOCAL_LLM_URL

Contract: Output must satisfy VALID_CATEGORIES (mechanical, electrical, body, safety, other) and VALID_SEVERITIES (low, medium, high, critical). Validation: validateSuggestion() runs in analyzer and as defense-in-depth in service layer.

Human-in-the-loop: Analyzer output is NEVER an Issue; it is a proposal stored as ai_suggested_* on the defect_report; coordinator must confirm before Issue creation.

## Human-in-the-Loop Boundary (Explicit)

```
+----------------------+         +----------------------+
|  AI Analyzer Output  |         |   Application Logic  |
|  (PROPOSAL only)     |         |  (mandatory validation)|
|  category, severity  |         |  - validates category in VALID_CATEGORIES|
|  summary (proposal)  |         |  - validates summary non-empty, <=500 chars|
|  severity (proposal) |         |  - validates severity in VALID_SEVERITIES|
+----------------------+         |  - Issue never created automatically|
                                |  - Coordinator must confirm via confirmedByName|
                                |  - Work Order never created on non-open Issue|
                                |  - Status transitions enforced via ALLOWED_TRANSITIONS map|
                                +----------------------+
```

Critical: The application MUST validate and process AI proposals; no auto-creation of Issues or Work Orders occurs without human confirmation through the application API.

## Data Flow Diagrams

### Flow 1: Create Work Order from Eligible Issue

```
User visits /work-orders
  -> Browser fetches eligible issues via server-side service
  -> SQL: open issues NOT IN (SELECT issue_id FROM work_orders)
  -> Renders grid of issue cards with create-work-order forms
  -> User fills form (assignedTo, notes) + submits
  -> POST /api/work-orders
  -> workOrderService.createWorkOrder()
  -> Validates Issue is open
  -> Creates work order with status created
  -> Page reloads
```

### Flow 2: Coordinator Review and Confirmation

```
User visits /reports/review
  -> listPendingReports() -> reports with status pending_review
  -> Each report renders raw text + AI proposal (pre-filled into form)
  -> User edits proposal if desired + enters confirmedByName
  -> Form submits to POST /api/reports/:id/confirm
  -> confirmReport() runs in transaction:
      -> Validates category, severity, summary, confirmedByName present
      -> Fetches report; verifies status = pending_review
      -> Creates Issue with status open
      -> Transitions report status to confirmed
  -> Redirects to /reports/review
```

### Flow 3: AI Analysis

```
User submits report text
  -> POST /api/reports/ai
  -> submitAIReport() calls analyzer with rawText only
  -> Analyzer (fake or Ollama) returns suggestion {category, severity, summary}
  -> validateSuggestion() checks contract
  -> If valid: persists report with ai_suggested_* + status pending_review
  -> If invalid: throws AIInvalidResponse; nothing persisted
  -> Coordinator reviews pending reports at /reports/review
  -> Coordinator confirms or rejects each report
```

## ADRs (Architectural Decision Records)

Documented in the engineering log (fleet-maintenance-engineering-log.md):
- ADR-001: Deliberately simple MVP stack
- ADR-002: Separate AI proposals from human-confirmed issues
- ADR-003: Provider-agnostic analyzer contract
- ADR-004: Human confirmation required before creating Issues
- ADR-005: Local LLM deployment and model selection
- ADR-006: Structured-output validation and AI failure handling
- ADR-007: Local LLM security boundary and LAN-only deployment

## Related Records
- Engineering log: fleet-maintenance-engineering-log.md
- TICKET-1 through TICKET-8: Implementation tickets in engineering log
- TICKET-9: Presentable reference project - current work item
