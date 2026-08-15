# FleetMaintenance

## Presentable Reference Prototype — AI-Assisted Fleet Maintenance Workflow

This is a small portfolio/reference prototype demonstrating an **AI-assisted fleet maintenance workflow** from defect report through maintenance lifecycle. It is intentionally local and small: the goal is not to build a complete fleet-management product, but to demonstrate product thinking, workflow modelling, pragmatic software architecture, AI-assisted development, and responsible LLM integration.

## Core Workflow

```text
User reports vehicle problem
      ↓
AI analyzes report
      ↓
AI produces structured proposal
      ↓
Human reviews / edits / confirms
      ↓
Confirmed Issue
      ↓
Work Order
      ↓
Maintenance lifecycle
```

**Key boundaries:**
- **AI output is a PROPOSAL** — never an Issue directly; the coordinator must confirm before an Issue exists
- **Human confirmation is mandatory** — the application never auto-creates Issues from AI analysis
- **Status transitions are validated** in the service layer; the generic transition endpoint enforces business rules
- **No React, no auth, no pagination** — vanilla JS + EJS + plain CSS; no build step

## Quick Start

### Deterministic Core (No LLM Required)

The application can be run and tested **without Ollama or any local LLM** — the fake analyzer provides deterministic category/severity/summary suggestions for development and testing.

```bash
# 1. Install dependencies
npm install

# 2. Set up the database (PostgreSQL required)
npm run db:setup

# 3. Start the application
npm start

# 4. Visit http://localhost:3000
# 5. Run the test suite
npm test   # 28/28 passing
```

### With Local LLM (Optional)

If you have Ollama running with a compatible model (e.g., `qwen3:30b-a3b`):

```bash
export AI_PROVIDER=local
npm start
```

The same application code works with both the fake analyzer and a local LLM — the provider is configured via `.env`.

## Architecture Overview

The application follows a **browser → API → DB** pattern with a **human-in-the-loop** constraint at its core:

```text
Browser (EJS + vanilla JS + plain CSS)
      │
      ▼
API Routes (/api, /work-orders)
      │
      ▼
Service Layer (business rules, status transitions)
      │
      ▼
Database (PostgreSQL, raw parameterized SQL, no ORM)
      │
      ▼
AI Analyzer (fake → local Ollama; contract-validated proposals only)
```

**Key boundaries:**
- **AI output is a PROPOSAL** — the analyzer's output is persisted as `ai_suggested_*` on a defect_report row; the coordinator still must confirm before an Issue can exist
- **Human confirmation is mandatory** — the `confirmReport` service validates `category`, `severity`, `summary`, and `confirmedByName` before creating an Issue
- **Status transitions are validated** in the service layer; the generic `POST /api/work-orders/:id/transition` endpoint enforces allowed transitions (`created → [in_progress, cancelled]`, `in_progress → [completed, cancelled]`)
- **No ORM** — raw parameterized SQL via `pg`; all queries are explicit and auditable
- **No React, no auth, no pagination** — the UI is server-rendered EJS with vanilla JS

## Technology Stack

| Layer | Technology |
|-------|-----------|
| **Application** | Node.js (LTS), Express, EJS, vanilla JS + `fetch()`, plain CSS |
| **Database** | PostgreSQL, `pg` / node-postgres, raw parameterized SQL, no ORM |
| **AI Analyzer** | Fake analyzer (deterministic) or local Ollama; contract-validated proposals only |
| **Testing** | 28 unit tests using fake db + fake analyzer; no live model required |
| **Deployment** | Docker Compose for local development; no production deployment scripts |

## Quick Start (Condensed)

```bash
# 1. Install dependencies
npm install

# 2. Set up the database (PostgreSQL required)
npm run db:setup

# 3. Start the application
npm start

# 3. Visit http://localhost:3000 to view the work-order overview

# 4. Run the test suite
npm test   # 28/28 passing, no live model required
```

## API Endpoints (Summary)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/` | Work-order overview page (eligible open issues) |
| `POST` | `/api/reports` | Create a manual defect report |
| `POST` | `/api/reports/ai` | Create an AI-assisted defect report (proposal only) |
| `POST` | `/api/reports/:id/confirm` | Confirm a report as an Issue (creates Issue + transitions status) |
| `POST` | `/api/reports/:id/reject` | Mark a report as rejected |
| `GET` | `/api/reports/pending` | List pending defect reports (for coordinator review) |
| `POST` | `/api/work-orders` | Create a work order from an open Issue |
| `POST` | `/api/work-orders/:id/transition` | Transition a work order to a new status |
| `GET` | `/api/health` | Health check endpoint |

## Project Milestones

| Milestone | Outcome |
|-----------|---------|
| **M0 — Foundation** | Local application skeleton and development infrastructure |
| **M1 — Manual Workflow** | Report → confirmation → issue → work order lifecycle without AI |
| **M2 — AI-Assisted Workflow** | AI-backed report analysis behind a provider-agnostic contract |
| **M3 — Coordinator Review UI** | Browser-based review and confirmation workflow |
| **M4 — Work-Order UI** | Browser-based work-order management |
| **M5 — Portfolio Polish** | Documentation, architecture record, tests, demo data, and final cleanup |

## Technical Decisions (ADRs)

The following Architectural Decision Records are documented in the engineering log:

- **ADR-001:** Deliberately simple MVP stack
- **ADR-002:** Separate AI proposals from human-confirmed issues
- **ADR-003:** Provider-agnostic analyzer contract
- **ADR-004:** Human confirmation required before creating Issues
- **ADR-005:** Local LLM deployment and model selection
- **ADR-006:** Structured-output validation and AI failure handling
- **ADR-007:** Local LLM security boundary and LAN-only deployment

## Test Suite

The project includes **28 automated tests** that cover the application without requiring a live model:

- **`tests/reportService.test.js`** — Defect report workflow (manual & AI submissions, confirmation, rejection)
- **`tests/workOrderService.test.js`** — Work-order creation, status transitions, valid/invalid jumps
- **`tests/localAnalyzer.test.js`** — Fake analyzer: deterministic mapping, contract validation, error handling

**To run:** `npm test` — all 28 tests pass without requiring a live LLM model.

## Folder Structure (Brief)

```text
src/              # Application source
  app.js          # Express app factory
  config.js       # Environment configuration
  routes/         # API + browser routes
  services/       # Business logic (no duplication of API endpoints)
  db/             # Database access (raw parameterized SQL)

views/            # EJS templates
  reports/        # Coordinator review UI
  work-orders/    # Work-order overview (TICKET-8)

public/           # Static assets (CSS, JS)
  css/            # Plain CSS styles
  js/             # Vanilla JavaScript

tests/            # Unit tests (fake db, mock analyzer)

views/partials/   # Reusable EJS partials
```

## License

This project is for portfolio/reference purposes. See the engineering log for architectural and product decisions.

---

*Last updated: 2026-08-15*
