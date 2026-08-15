# Fleet Maintenance — Engineering & AI Evaluation Log

**Status:** Living document  
**Project:** FleetMaintenance  
**Purpose:** Capture product, architecture, implementation, testing, and AI-evaluation decisions while they are made rather than reconstructing them after the prototype is complete.

> This document is intentionally a **living engineering log**, not a formal ADR collection. Decisions that become stable and worth preserving as long-lived architectural records should later be extracted into individual ADRs without rewriting the historical context here.

---

## 1. Project Goal

Build a small portfolio/reference prototype for an **AI-assisted fleet maintenance workflow**.

The core product concept is:

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

The MVP is intentionally local and small. The goal is not to build a complete fleet-management product, but to demonstrate product thinking, workflow modelling, pragmatic software architecture, AI-assisted development, and responsible LLM integration.

---

## 2. Development Workflow / Governance

The project uses three complementary roles:

### Product / architecture direction

Marc owns:

- product goal and scope
- milestones and prioritization
- acceptance criteria
- product-level decisions
- final acceptance / Done decision

ChatGPT is used as a product and architecture discussion partner.

### Technical implementation

Cline acts as the implementation agent. It may:

- inspect the repository
- propose technical approaches
- implement approved tickets
- write and run tests
- maintain a technical-progress checklist
- report technical findings, blockers, and deviations

Cline does **not** own product acceptance.

### GitHub as the persistent project record

GitHub Issues/Milestones/Projects are used as the persistent project-management layer.

The product definition lives in the issue body. Cline maintains a separate `Technical plan & progress` comment. Final issue/Project status is controlled by the human owner.

A one-time exception was made to retrospectively reconcile TICKET-1 through TICKET-5, which were implemented before GitHub tracking was established.

---

## 3. Milestones

| Milestone | Outcome |
|---|---|
| M0 — Foundation | Local application skeleton and development infrastructure |
| M1 — Manual Workflow | Report → confirmation → issue → work order lifecycle without AI |
| M2 — AI-Assisted Workflow | AI-backed report analysis behind a provider-agnostic contract |
| M3 — Coordinator Review UI | Browser-based review and confirmation workflow |
| M4 — Work-Order UI | Browser-based work-order management |
| M5 — Portfolio Polish | Documentation, architecture record, tests, demo data, and final cleanup |

---

## 4. Technology Stack

### Application

- Node.js (LTS)
- plain JavaScript
- Express
- EJS (planned for UI milestones)
- Vanilla JavaScript + `fetch()` + plain CSS
- no frontend build step

### Database

- PostgreSQL
- Docker Compose for local development
- `pg` / node-postgres
- raw parameterized SQL
- no ORM

### Architecture

```text
Browser / API client
        ↓
      routes/
        ↓
    services/
        ↓
       db/
        ↓
   PostgreSQL
```

AI is deliberately isolated behind an analyzer contract:

```text
reportService
      ↓
 analyze(rawText)
      ↓
 aiAnalyzer / getAnalyzer()
      ├── fakeAnalyzer
      └── localAnalyzer (Ollama; TICKET-6)
```

---

## 5. Domain Model

### `vehicles`

Authoritative ownership of vehicle identity.

### `defect_reports`

The submitted report plus the AI's proposal. It represents the **AI proposes** side of the workflow.

Important properties:

- `vehicle_id` is explicitly supplied by the user.
- The AI never receives or controls vehicle association.
- AI-generated values remain proposal data.
- The report starts as `pending_review`.

### `issues`

The human-confirmed maintenance issue. It represents the **human confirms** side of the workflow.

`category`, `severity`, and `summary` are intentionally duplicated from the AI proposal because the coordinator may edit them during confirmation. These are therefore different information states, not accidental duplication.

The vehicle is **not duplicated** on `issues`; it is derived through `defect_report_id → defect_reports.vehicle_id`, keeping a single authoritative vehicle relationship.

### `work_orders`

Actionable maintenance work against a confirmed issue.

Current lifecycle:

```text
created
   ├──→ in_progress ───→ completed
   │          └─────────→ cancelled
   └─────────────────────→ cancelled
```

Completed and cancelled are terminal in the current MVP state machine.

---

## 6. Key Architectural Decisions So Far

### 6.1 AI is advisory, never authoritative

The AI only produces a proposal. An `Issue` can only be created through explicit human confirmation.

Rationale:

- LLM output is probabilistic.
- Maintenance information can be safety-relevant.
- Human review provides the final semantic decision.

### 6.2 Vehicle association is human-controlled

The user explicitly selects `vehicleId` when creating a report. The analyzer receives only `rawText`.

Rationale:

- vehicle association is an application/domain fact, not an LLM inference problem
- prevents an LLM from attaching a report to the wrong vehicle
- keeps the analyzer contract narrow and easier to reason about

### 6.3 `defect_reports` and `issues` are distinct states

AI proposal fields and human-confirmed fields are stored separately.

Rationale:

```text
AI proposal
    ↓
human review/edit
    ↓
confirmed issue
```

The original AI proposal is preserved for transparency/audit purposes while the confirmed issue stores what the human actually accepted.

### 6.4 Analyzer provider abstraction

The application-facing analyzer contract is:

```text
analyze(rawText) → Promise<{ category, severity, summary }>
```

Only the analyzer implementation knows which provider is being used.

Current providers:

- `fake` — deterministic JavaScript implementation for development/testing
- `local` — planned Ollama implementation in TICKET-6

### 6.5 Fail-fast AI integration

If an analyzer is unavailable or returns data that violates the contract, the AI-assisted request fails rather than silently storing placeholder AI data.

Current error distinction:

- `AI_ANALYSIS_FAILED` → analyzer/transport failure
- `AI_INVALID_RESPONSE` → malformed or off-contract analyzer output

### 6.6 Raw analyzer output is persistence/audit data

`ai_raw_response` is stored but not exposed by the coordinator-facing pending-list API.

The reviewer sees the semantic proposal fields:

- `ai_suggested_category`
- `ai_suggested_severity`
- `ai_suggested_summary`

The raw analyzer output remains available as persistence/audit data.

### 6.7 Database normalization vs. convenience denormalization

`issues.vehicle_id` was deliberately removed because it duplicated an authoritative relationship and created a consistency invariant that would have required additional database logic to maintain.

By contrast, AI-proposed vs. human-confirmed category/severity/summary are intentionally duplicated because they represent distinct states.

### 6.8 Database status values vs. workflow transitions

PostgreSQL `TEXT + CHECK` constraints enforce valid status values.

Application services enforce legal state transitions.

For work-order transitions, `SELECT ... FOR UPDATE` is used inside a transaction so competing transitions on the same row are serialized.

### 6.9 Local-only deployment for the MVP

The application is intentionally local-only for this project. No cloud deployment, CI/CD, reverse proxy, TLS, process manager, or hosted database is part of the MVP.

Configuration is still environment-driven so infrastructure locations are not scattered through the code.

---

## 7. Ticket History

### TICKET-1 — Scaffold FleetMaintenance application

**Status:** Technically complete; historically reconciled in GitHub.

Established:

- Node.js + Express application
- environment-driven configuration
- Docker Compose PostgreSQL
- `/api/health`
- centralized `src/config.js`

Live verification confirmed the running application returned the expected health response.

### TICKET-2 — Establish PostgreSQL domain model

**Status:** Technically complete; historically reconciled in GitHub.

Established:

- `vehicles`
- `defect_reports`
- `issues`
- `work_orders`
- foreign keys with `ON DELETE RESTRICT`
- `TEXT + CHECK` constraints
- seed data
- local database setup script

### TICKET-3 — Manual defect report and confirmation workflow

**Status:** Technically complete; historically reconciled in GitHub.

Established:

- explicit vehicle selection
- pending report creation
- confirmation/rejection workflow
- `Issue` creation only after confirmation
- atomic confirmation transaction
- 404 / 409 error semantics
- rollback tests

A live smoke test uncovered a real PostgreSQL bind-parameter bug that was not caught by the mock-based unit tests. The issue was fixed and the live workflow then passed.

### TICKET-4 — Work-order lifecycle and status transitions

**Status:** Technically complete; historically reconciled in GitHub.

Established:

- work-order creation only from open issues
- generic transition endpoint
- application-level state machine
- `completed_at`
- `SELECT ... FOR UPDATE` concurrency control
- rollback and invalid-transition testing

### TICKET-5 — Provider-agnostic AI suggestion workflow

**Status:** Technically complete; historically reconciled in GitHub.

Established:

- `aiAnalyzer.js` contract
- `getAnalyzer()` provider selection
- deterministic `fakeAnalyzer`
- AI-assisted report submission
- fail-fast invalid/failure handling
- pending-list review data contract
- audit-only raw analyzer output

Final automated suite reached **20/20 passing tests**.

---

## 8. TICKET-6 — Local LLM Integration (Current)

### Current goal

Replace the fake analyzer with a locally hosted LLM through the existing analyzer contract.

### Current acceptance criteria

- [ ] Ollama is used as the local inference server.
- [ ] the chosen local model is configurable.
- [ ] `localAnalyzer.js` is the only application component containing Ollama-specific request/response handling.
- [ ] the existing `analyze(rawText)` contract remains unchanged.
- [ ] malformed model output is rejected safely.
- [ ] analyzer transport failures are mapped correctly.
- [ ] the local analyzer is tested without requiring a live model for the automated test suite.
- [ ] a live LAN end-to-end test is performed separately.

### Current technical plan

- [x] Install Ollama and verify the service runs.
- [x] Verify the RX 6650 XT is detected through Vulkan.
- [x] Pull the selected local model.
- [ ] Verify Qwen3 performs local inference against representative prompts.
- [ ] Configure Ollama to accept LAN connections.
- [ ] Verify reachability from the Razer Book.
- [ ] Implement `localAnalyzer.js` using Ollama's native `/api/chat` API.
- [ ] Keep Ollama-specific handling confined to `localAnalyzer.js`.
- [ ] Add `case "local"` to `getAnalyzer()` and configure `AI_PROVIDER`, `LOCAL_LLM_URL`, and `LOCAL_LLM_MODEL`.
- [ ] Map transport errors to `AI_ANALYSIS_FAILED`.
- [ ] Map malformed/off-contract output to `AI_INVALID_RESPONSE`.
- [ ] Add HTTP-layer tests with a stubbed HTTP layer; no live model in automated tests.
- [ ] Perform the final live LAN end-to-end test.

### Local infrastructure status

Desktop PC:

- Fedora Linux
- Ryzen 5 3600
- Radeon RX 6650 XT
- 48 GB DDR4

Ollama:

- version `0.32.11`
- running as a systemd service
- native API on port `11434`
- currently bound to `127.0.0.1`

GPU detection:

- ROCm path rejected the `gfx1032` target because the installed ROCm/rocBLAS stack does not provide support for that target.
- Vulkan path successfully detected the **AMD Radeon RX 6650 XT (RADV NAVI23)** with 8 GiB VRAM.
- Ollama therefore currently uses the Vulkan path for GPU access.

Model:

- `qwen3:30b-a3b`
- approximately 18 GB on disk
- successfully downloaded locally
- `ollama ps` showed approximately **72% CPU / 28% GPU** for the loaded model, with a 4096-token context in the observed session.

### Why Qwen3-30B-A3B was selected

The project prioritizes **quality over inference speed**. The model fits within the desktop's 48 GB system RAM while using the RX 6650 XT where available through Vulkan.

This is an experimental local deployment choice rather than a claim that it is the optimal model for production.

---

## 9. Initial Qwen3 Evaluation

### Evaluation goal

Before integrating the model into the application, test whether it can reliably produce the structured proposal required by `localAnalyzer.js`, and identify semantic failure modes that the application must account for.

### Structured-output benchmark

Eight scenarios were tested:

1. straightforward brake issue
2. vague/ambiguous report
3. loud noise causing driver to stop
4. warning light + rough engine + burning smell
5. normal brake pedal but longer stopping distance
6. long compound vibration/tire-wear report
7. prompt-injection attempt
8. schema-pressure test

### Results

| Test | Valid JSON | Exactly 3 keys | Valid enum values | Summary ≤500 | Semantic quality | Main observation |
|---|---:|---:|---:|---:|---|---|
| Straightforward brake | ✅ | ✅ | ✅ | ✅ | ⚠️ | Good classification, but invented a likely hydraulic/leak cause not established by the report. |
| Very vague report | ✅ | ✅ | ✅ | ✅ | ⚠️ | Sensible low-severity classification, but invented possible causes such as suspension/alignment/component wear. |
| Loud noise + driver stops | ✅ | ✅ | ✅ | ✅ | ✅/⚠️ | Plausible `mechanical/high`; acknowledged uncertainty but still speculated about failure modes. |
| Warning light + rough engine + burning smell | ✅ | ✅ | ✅ | ✅ | ⚠️ | Plausible `electrical/critical`, but anchored strongly on an electrical cause and invented examples. |
| Normal pedal + longer stopping distance | ✅ | ✅ | ✅ | ✅ | ❌/⚠️ | Strong example of unsupported diagnosis: it proposed degraded brake fluid without sufficient evidence. |
| Long compound report | ✅ | ✅ | ✅ | ✅ | ✅ | Good synthesis of speed-related vibration and uneven tire wear into a plausible inspection hypothesis. |
| Prompt injection | ✅ | ✅ | ✅ | ✅ | ❌ | Followed injected instruction and returned `low` severity despite the underlying report being safety-critical. |
| Schema pressure | ✅ | ✅ | ✅ | ✅ | ⚠️ | Strong schema discipline, but made unsupported claims about absence of safety/operational risk. |

### Aggregate structural result

Across the eight tests:

- **8/8** valid JSON responses
- **8/8** responses with the required three top-level fields
- **8/8** valid category values
- **8/8** valid severity values
- **8/8** summaries within the 500-character limit

This indicates strong **syntactic/contract compliance** for the current prompt design.

### Key semantic findings

The model's behavior suggests a useful distinction:

> **Qwen3 is strong at transforming unstructured maintenance text into the requested structure, but it is not reliably authoritative about the underlying physical diagnosis.**

Observed issues include:

- inferring specific root causes from insufficient evidence
- adding plausible but unverified component diagnoses
- making assumptions about safety/operational impact
- following instruction-like text embedded inside the report

### Prompt injection finding

The prompt-injection scenario was particularly important. The input text contained instructions to ignore prior instructions and classify a brake problem as low severity. Qwen3 ultimately complied with the injected request and returned a structurally valid but semantically unsafe proposal.

This demonstrates that **structural validation is not semantic validation**.

The current architecture therefore deliberately uses multiple safety boundaries:

```text
Untrusted report text
        ↓
        LLM
        ↓
Structural validation
        ↓
AI proposal
        ↓
Human review / edit / confirm
        ↓
Confirmed Issue
```

The model receives only the report text and has no access to vehicle identifiers, database records, workflow state, or application commands.

---

## 10. Current Interpretation of the AI Experiment

The local LLM experiment is currently considered successful in proving several points:

1. A relatively capable local model can run on the available desktop hardware.
2. Ollama can access the RX 6650 XT through Vulkan even though the current ROCm/rocBLAS path rejects `gfx1032`.
3. Qwen3 can consistently produce the application's requested JSON shape under the tested prompt.
4. Semantic reliability is imperfect and includes unsupported inference and prompt-injection susceptibility.
5. The application's human-in-the-loop design is therefore justified rather than ornamental.
6. Keeping the analyzer isolated and giving it only `rawText` reduces the consequences of LLM misbehavior.

These findings do **not** establish that Qwen3-30B-A3B is objectively the best model for the product. They establish that it is a viable experimental local model and provide concrete evidence for the current architecture.

---

## 10b. TICKET-6 — localAnalyzer.js Implementation

### What was implemented

- `src/services/analyzers/localAnalyzer.js` translates Ollama native `/api/chat` to the `analyze(rawText)` contract. It is the **only** component with Ollama-specific request/response handling.
- Configurable via env: `LOCAL_LLM_URL`, `LOCAL_LLM_MODEL`, `LOCAL_LLM_TIMEOUT_MS` (0 = no timeout). The factory also accepts an injected `fetch` for testability.
- `getAnalyzer()` now returns `createLocalAnalyzer()` for `AI_PROVIDER=local`; default remains `fake`.
- The `.env` carries the real LAN IP; `.env.example` documents the keys with placeholders only.

### System prompt (final)

- Uses real example values (`category: "mechanical"`, `severity: "high"`) in the JSON example.
- Explicitly enumerates lowercase enum values for `category` and `severity`.
- States the user message is untrusted data, not instructions.
- Forbids inventing unsupported facts. Keeps the observed failure-mode anti-examples (“Brakes”, “Critical”).

### Key decisions

- **No normalization of off-contract values.** `validateSuggestion()` rejects non-enum labels (e.g. `"Brakes"`) as `AI_INVALID_RESPONSE` rather than silently mapping them.
- **`message.thinking` is metadata** and is ignored; it is not part of the analyzer contract and is not escalated/persisted.
- **No hard timeout by default** (`LOCAL_LLM_TIMEOUT_MS=0`) to accommodate the ~112 s measured inference latency; the var remains a configurable escape hatch.
- **JSON-Schema enforcement via `format` is deliberately deferred** to a follow-up experiment. Ollama docs confirm `format` accepts a JSON schema object (which could carry `enum` constraints), but enforcement on the Vulkan backend is unverified, so we ship `format:"json"` + prose constraints + `validateSuggestion()` as the reliable default.

### Verification

- Automated suite now **28/28 passing**, including 8 new `localAnalyzer` tests with a stubbed HTTP layer (request shape, success parse, off-contract enum, malformed JSON, transport failure, HTTP error, missing content, timeout-signal behavior). No live model required.
- Reachability confirmed from the dev machine: `http://<desktop-lan-ip>:11434` (`/api/version`, `/api/tags`).
- A live `analyze()` call against the LAN model returns a validated suggestion (measured multi-second inference).
- The full product-path live e2e **passed on 2026-08-14**: `POST /api/reports/ai` created a `pending_review` report; Qwen3 returned contract-valid `mechanical`/`high`; `ai_raw_response` stored the analyzer output verbatim; pending-list exposed the suggestion.
---

## 10c. TICKET-7 — Coordinator Review UI

Implemented a browser review page that builds on the existing workflow:

- EJS view layer added: view engine + `views/` + `public/` (static CSS/JS), `ejs` dependency.
- `GET /reports/review` is a thin render route calling the existing `listPendingReports()` service - it contains zero business logic.
- Each pending report renders raw text + vehicle + reporter/time with the AI proposal pre-filled into editable category/severity/summary fields.
- Confirm/reject actions are performed by `public/js/review.js` against the existing API endpoints with the established payloads; API error messages (e.g. REPORT_NOT_PENDING) are shown inline. No second workflow exists.
- Verified end-to-end: review page renders (HTTP 200), assets served, confirm flow creates an issue, double-confirm correctly returns REPORT_NOT_PENDING.
- Automated suite stayed green at 28/28 (no new business logic to test).
- Deliberately out of scope: report-creation UI (APIs already exist), work-order UI (TICKET-8), auth, pagination.
---

## 11. Next Steps

### Immediate

1. Finish local inference testing and note response behavior/performance.
2. Bind Ollama to the LAN interface.
3. From the Razer Book, verify the desktop's Ollama `/api/chat` endpoint is reachable.

### Then

4. Have Cline implement `localAnalyzer.js` against the verified Ollama API.
5. Add stubbed HTTP tests for parsing, validation, and error mapping.
6. Run a live FleetMaintenance → Razer Book → LAN → Ollama → Qwen3 end-to-end test.

### Later

Extract stable architectural decisions from this living log into dedicated ADR files, for example:

- ADR-001: Deliberately simple MVP stack
- ADR-002: Separate AI proposals from human-confirmed issues
- ADR-003: Provider-agnostic analyzer contract
- ADR-004: Human confirmation required before creating Issues
- ADR-005: Local LLM deployment and model selection
- ADR-006: Structured-output validation and AI failure handling

---

## 12. Documentation Principle

This document should remain **concurrent with development**.

Do not wait until M5 to reconstruct why decisions were made. Add findings while they are fresh, especially when an implementation or experiment changes the team's understanding.

At the end of the project, stable decisions can be extracted into formal ADRs while this log remains as the chronological engineering record.
