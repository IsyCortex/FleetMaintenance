-- ============================================================================
-- Fleet Maintenance - MVP schema (PostgreSQL, local dev)
-- Applied via: npm run db:setup   (runs db/setup.js)
--
-- Design notes:
--   * status columns use TEXT + CHECK to enforce ALLOWED VALUES at the DB
--     level only. Valid status TRANSITIONS are business rules enforced in the
--     application/service layer (TICKET-4), not in the database.
--   * defect_reports holds the RAW text + the AI's PROPOSED category/severity/
--     summary. issues holds the CONFIRMED (possibly coordinator-edited) values.
--     The intentional duplication of category/severity/summary preserves the
--     AI-suggestion vs. human-confirmed distinction for auditability.
--   * issues.vehicle_id is intentionally NOT stored: the vehicle is derived via
--     issues.defect_report_id -> defect_reports.vehicle_id. Storing it would be
--     redundant (report's vehicle_id is immutable) and would add a consistency
--     invariant with no additional business information.
--   * Status-column indexes exist because status-filtered list queries are the
--     expected application access patterns. Status is a LOW-cardinality field;
--     these indexes are a convenience reflecting those patterns and are NOT
--     performance-critical at MVP scale.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- VEHICLES - reference data for the fleet.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS vehicles (
  id            integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  label         varchar(50)  NOT NULL,
  license_plate varchar(20)  NOT NULL,
  odometer      integer      NOT NULL DEFAULT 0
);

-- ----------------------------------------------------------------------------
-- DEFECT_REPORTS - the raw report + the AI's proposal ("AI proposes").
-- The user always explicitly selects the vehicle; the AI never sets it.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS defect_reports (
  id                    integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  vehicle_id            integer NOT NULL REFERENCES vehicles(id) ON DELETE RESTRICT,
  raw_text              text    NOT NULL,
  reported_by_name      varchar(100) NOT NULL,
  reported_at           timestamptz  NOT NULL DEFAULT now(),
  ai_suggested_category varchar(20)  NOT NULL
                          CHECK (ai_suggested_category IN
                            ('mechanical','electrical','body','safety','other')),
  ai_suggested_severity varchar(10)  NOT NULL
                          CHECK (ai_suggested_severity IN
                            ('low','medium','high','critical')),
  ai_suggested_summary  varchar(500) NOT NULL,
  ai_raw_response       jsonb,                             -- full analyzer output, audit only
  status                varchar(20) NOT NULL DEFAULT 'pending_review'
                          CHECK (status IN
                            ('pending_review','confirmed','rejected'))
);

-- ----------------------------------------------------------------------------
-- ISSUES - created ONLY when a coordinator confirms a defect report
-- ("human confirms"). Holds the confirmed (possibly edited) values.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS issues (
  id                integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  defect_report_id  integer NOT NULL UNIQUE                 -- one issue per report
                    REFERENCES defect_reports(id) ON DELETE RESTRICT,
  category          varchar(20) NOT NULL
                      CHECK (category IN
                        ('mechanical','electrical','body','safety','other')),
  severity          varchar(10) NOT NULL
                      CHECK (severity IN ('low','medium','high','critical')),
  summary           varchar(500) NOT NULL,
  confirmed_by_name varchar(100) NOT NULL,
  confirmed_at      timestamptz NOT NULL DEFAULT now(),
  status            varchar(20) NOT NULL DEFAULT 'open'
                      CHECK (status IN ('open','in_progress','resolved','closed'))
);

-- ----------------------------------------------------------------------------
-- WORK_ORDERS - an actionable work item against an issue. The DB enforces
-- valid status VALUES only; TRANSITIONS live in the service layer (TICKET-4).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS work_orders (
  id           integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  issue_id     integer NOT NULL REFERENCES issues(id) ON DELETE RESTRICT,
  assigned_to  varchar(100),
  status       varchar(20) NOT NULL DEFAULT 'created'
                 CHECK (status IN ('created','in_progress','completed','cancelled')),
  notes        text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

-- ----------------------------------------------------------------------------
-- INDEXES
--   * FK columns: standard support for the join-heavy list/read queries.
--   * status columns: mirror expected status-filtered list queries. Status is
--     LOW-cardinality; these are access-pattern conveniences, not performance
--     requirements at MVP scale.
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_defect_reports_vehicle_id ON defect_reports (vehicle_id);
CREATE INDEX IF NOT EXISTS idx_defect_reports_status     ON defect_reports (status);
CREATE INDEX IF NOT EXISTS idx_issues_status             ON issues (status);
CREATE INDEX IF NOT EXISTS idx_work_orders_issue_id      ON work_orders (issue_id);
CREATE INDEX IF NOT EXISTS idx_work_orders_status        ON work_orders (status);