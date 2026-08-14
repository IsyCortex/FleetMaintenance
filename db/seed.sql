-- ============================================================================
-- Seed data: sample vehicles + a couple of defect reports for local development.
-- Applied AFTER schema.sql via: npm run db:setup
-- NOTE: during the MVP, defect reports are created through the application
-- (TICKET-3/5), so the two reports below are optional demo data only.
-- ============================================================================

-- Sample fleet ---------------------------------------------------------------
INSERT INTO vehicles (label, license_plate, odometer) VALUES
  ('Van 1', 'FM-XV-001', 84250),
  ('Van 2', 'FM-XV-002', 119300),
  ('Truck 7', 'FM-TR-007', 54000);

-- A couple of "submitted but not yet confirmed" reports (demo of the AI step) -
-- NOTE: normally ai_suggested_* fields would be produced by the analyzer.
INSERT INTO defect_reports (
  vehicle_id, raw_text, reported_by_name,
  ai_suggested_category, ai_suggested_severity, ai_suggested_summary,
  ai_raw_response, status
) VALUES
  (
    1,
    'Brakes feel spongy and the pedal goes almost to the floor since this morning.',
    'Dana Miller',
    'mechanical', 'high',
    'Possible brake system fault - spongy pedal, reduced braking response.',
    '{"category":"mechanical","severity":"high","summary":"Possible brake system fault"}',
    'pending_review'
  ),
  (
    2,
    'The ABS warning light on the dashboard stays on even after restarting the engine.',
    'James Carter',
    'electrical', 'medium',
    'ABS warning light illuminated - possibly a sensor or wiring fault.',
    '{"category":"electrical","severity":"medium","summary":"ABS warning light issue"}',
    'pending_review'
  );