import { runMigrations } from "@agent-native/core/db";

// Additive only: append new entries with a new version and a unique `name`;
// never edit or drop an existing one.
export const boardMigrations = [
  {
    version: 1,
    name: "redstring-board-initial",
    sql: `
CREATE TABLE IF NOT EXISTS rs_cases (
  id TEXT PRIMARY KEY,
  owner_email TEXT NOT NULL,
  title TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rs_cases_owner ON rs_cases (owner_email, created_at);

CREATE TABLE IF NOT EXISTS rs_nodes (
  id TEXT PRIMARY KEY,
  owner_email TEXT NOT NULL,
  case_id TEXT NOT NULL,
  type TEXT NOT NULL,
  key TEXT NOT NULL,
  label TEXT NOT NULL,
  facts_json TEXT NOT NULL,
  status TEXT NOT NULL,
  reason TEXT,
  added_by TEXT NOT NULL,
  x DOUBLE PRECISION,
  y DOUBLE PRECISION,
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_rs_nodes_case_type_key ON rs_nodes (case_id, type, key);
CREATE INDEX IF NOT EXISTS idx_rs_nodes_owner_case ON rs_nodes (owner_email, case_id);

CREATE TABLE IF NOT EXISTS rs_edges (
  id TEXT PRIMARY KEY,
  owner_email TEXT NOT NULL,
  case_id TEXT NOT NULL,
  type TEXT NOT NULL,
  from_id TEXT NOT NULL,
  to_id TEXT NOT NULL,
  status TEXT NOT NULL,
  reason TEXT,
  added_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_rs_edges_case_type_ends ON rs_edges (case_id, type, from_id, to_id);
CREATE INDEX IF NOT EXISTS idx_rs_edges_owner_case ON rs_edges (owner_email, case_id);

CREATE TABLE IF NOT EXISTS rs_evidence (
  id TEXT PRIMARY KEY,
  owner_email TEXT NOT NULL,
  case_id TEXT NOT NULL,
  target_kind TEXT NOT NULL,
  target_id TEXT NOT NULL,
  source TEXT NOT NULL,
  url TEXT NOT NULL,
  record_id TEXT NOT NULL,
  retrieved_at TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  excerpt TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rs_evidence_owner_case ON rs_evidence (owner_email, case_id);

CREATE TABLE IF NOT EXISTS rs_activity (
  id TEXT PRIMARY KEY,
  owner_email TEXT NOT NULL,
  case_id TEXT NOT NULL,
  actor TEXT NOT NULL,
  caller TEXT NOT NULL,
  kind TEXT NOT NULL,
  target_id TEXT,
  detail TEXT,
  at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rs_activity_owner_case ON rs_activity (owner_email, case_id, at);

CREATE TABLE IF NOT EXISTS rs_coverage (
  id TEXT PRIMARY KEY,
  owner_email TEXT NOT NULL,
  case_id TEXT NOT NULL,
  source TEXT NOT NULL,
  state TEXT NOT NULL,
  note TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_rs_coverage_case_source ON rs_coverage (case_id, source);

CREATE TABLE IF NOT EXISTS rs_suggestions (
  id TEXT PRIMARY KEY,
  owner_email TEXT NOT NULL,
  case_id TEXT NOT NULL,
  target_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rs_suggestions_owner_case ON rs_suggestions (owner_email, case_id);

CREATE TABLE IF NOT EXISTS rs_watches (
  id TEXT PRIMARY KEY,
  owner_email TEXT NOT NULL,
  case_id TEXT NOT NULL,
  node_id TEXT NOT NULL,
  company_number TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rs_watches_owner_case ON rs_watches (owner_email, case_id);

CREATE TABLE IF NOT EXISTS rs_snapshots (
  id TEXT PRIMARY KEY,
  owner_email TEXT NOT NULL,
  watch_id TEXT NOT NULL,
  officers_hash TEXT NOT NULL,
  controllers_hash TEXT NOT NULL,
  filings_hash TEXT NOT NULL,
  filing_count INTEGER NOT NULL,
  taken_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rs_snapshots_owner_watch ON rs_snapshots (owner_email, watch_id, taken_at);

CREATE TABLE IF NOT EXISTS rs_changes (
  id TEXT PRIMARY KEY,
  owner_email TEXT NOT NULL,
  case_id TEXT NOT NULL,
  watch_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  summary TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rs_changes_owner_case ON rs_changes (owner_email, case_id);

CREATE TABLE IF NOT EXISTS rs_usage (
  id TEXT PRIMARY KEY,
  owner_email TEXT NOT NULL,
  kind TEXT NOT NULL,
  bucket TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_rs_usage_owner_kind_bucket ON rs_usage (owner_email, kind, bucket);
`,
  },
  {
    version: 2,
    name: "redstring-coverage-per-company",
    // "What was searched" is kept per company: a clean read of one company must not replace the
    // note that another company's read was cut short. Existing rows keep the empty subject.
    sql: `
ALTER TABLE rs_coverage ADD COLUMN IF NOT EXISTS subject_id TEXT NOT NULL DEFAULT '';
DROP INDEX IF EXISTS idx_rs_coverage_case_source;
CREATE UNIQUE INDEX IF NOT EXISTS idx_rs_coverage_case_source_subject ON rs_coverage (case_id, source, subject_id);
`,
  },
];

export const runBoardMigrations = runMigrations(boardMigrations, {
  table: "redstring_migrations",
});
