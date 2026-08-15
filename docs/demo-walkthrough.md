# Demo / Seed Walkthrough

## Overview

This document describes how to run the full deterministic demo scenario through the Fleet Maintenance application interfaces. The demo exercises the complete workflow: defect report creation -> AI proposal -> coordinator confirmation -> Issue creation -> work order creation -> status transition.

The demo uses the fake analyzer (deterministic, no Ollama required) so the entire flow can be demonstrated without external dependencies.

## Prerequisites

npm install
docker compose up -d
npm run db:setup
npm start

Visit http://localhost:3000

## Deterministic Seed Data

The db/seed.sql file pre-seeds the database with:
- 3 vehicles: Van 1, Van 2, Truck 7
- 2 defect reports: Both in pending_review status with AI-suggested proposals pre-filled

These seed reports simulate the output after the AI analysis step, so the coordinator review page shows pending reports for confirmation.

## End-to-End Walkthrough

### Step 1: Review Pending Reports (Coordinator)

Navigate to http://localhost:3000/reports/review.

You will see two pending defect reports:
- Report 1: Van 1 - Brakes feel spongy (AI-suggested: mechanical, high)
- Report 2: Van 2 - ABS warning light (AI-suggested: electrical, medium)

### Step 2: Confirm a Report as an Issue

1. Select Report 1 (Van 1 - brake issue)
2. Review the AI proposal (mechanical, high, brake system fault)
3. Enter your name in "Confirmed by" (e.g., "Coordinator A")
4. Click "Confirm issue"

The application will:
- Create a new Issue (status: open) with the confirmed category/severity/summary
- Transition the defect report status to confirmed
- Redirect back to the review page (report no longer appears)

### Step 3: Create a Work Order

1. Navigate to http://localhost:3000/work-orders
2. You will see Issue 1 listed as an eligible issue (open, no existing work order)
3. Enter assignee name (e.g., "Bob") in the "Assigned To" field
4. Optionally add notes
5. Click "Create work order"

The application will:
- Validate that the Issue is still open
- Create a new work order (status: created) linked to the Issue
- Reload the page (the issue is no longer available for new work orders)

### Step 4: Transition Work Order Status

After creating a work order, you can transition its status via the API:

```bash
curl -X POST http://localhost:3000/api/work-orders/1/transition \
  -H "Content-Type: application/json" \
  -d '{"status": "in_progress"}'
```

Then:
```bash
curl -X POST http://localhost:3000/api/work-orders/1/transition \
  -H "Content-Type: application/json" \
  -d '{"status": "completed"}'
```

The completed work order will have completed_at populated automatically.

### Step 5: Attempt Invalid Transitions

Attempt an invalid transition on a work order in a terminal state (e.g., cancelled to completed):

```bash
curl -X POST http://localhost:3000/api/work-orders/1/transition \
  -H "Content-Type: application/json" \
  -d '{"status": "completed"}'
```

Expected response: 409 INVALID_TRANSITION (cannot transition from or to terminal states)

## Full Workflow Summary

1. Defect report created (pending_review) with AI proposal
2. Coordinator confirms report -> Issue created (open) + report transitions to confirmed
3. Work order created from open Issue (status: created)
4. Work order transitioned: created -> in_progress
5. Work order transitioned: in_progress -> completed (completed_at populated)
6. Invalid transitions rejected at service layer (INVALID_TRANSITION)

## Deterministic Demo (No LLM Required)

All of the above works with AI_PROVIDER=fake (the default). The fake analyzer provides deterministic category/severity/summary based on keyword matching, so the same inputs always produce the same proposals. The existing seed.sql populates two pending reports ready for coordinator review, making it possible to demo the confirm/report workflow immediately after db:setup.
