import {
  integer,
  real,
  table,
  text,
  uniqueIndex,
} from "@agent-native/core/db/schema";

// SQL names carry an `rs_` prefix so they cannot collide with the framework's
// own tables in a shared hosted database. Every table has `owner_email`, and
// every query in the store filters by it.

export const cases = table("rs_cases", {
  id: text("id").primaryKey(),
  ownerEmail: text("owner_email").notNull(),
  title: text("title").notNull(),
  createdAt: text("created_at").notNull(),
});

export const nodes = table(
  "rs_nodes",
  {
    id: text("id").primaryKey(),
    ownerEmail: text("owner_email").notNull(),
    caseId: text("case_id").notNull(),
    type: text("type").notNull(),
    key: text("key").notNull(),
    label: text("label").notNull(),
    factsJson: text("facts_json").notNull(),
    status: text("status").notNull(),
    reason: text("reason"),
    addedBy: text("added_by").notNull(),
    x: real("x"),
    y: real("y"),
    createdAt: text("created_at").notNull(),
  },
  (t) => ({
    caseTypeKey: uniqueIndex("idx_rs_nodes_case_type_key").on(
      t.caseId,
      t.type,
      t.key,
    ),
  }),
);

export const edges = table(
  "rs_edges",
  {
    id: text("id").primaryKey(),
    ownerEmail: text("owner_email").notNull(),
    caseId: text("case_id").notNull(),
    type: text("type").notNull(),
    fromId: text("from_id").notNull(),
    toId: text("to_id").notNull(),
    status: text("status").notNull(),
    reason: text("reason"),
    addedBy: text("added_by").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => ({
    caseTypeEnds: uniqueIndex("idx_rs_edges_case_type_ends").on(
      t.caseId,
      t.type,
      t.fromId,
      t.toId,
    ),
  }),
);

export const evidence = table("rs_evidence", {
  id: text("id").primaryKey(),
  ownerEmail: text("owner_email").notNull(),
  caseId: text("case_id").notNull(),
  targetKind: text("target_kind").notNull(),
  targetId: text("target_id").notNull(),
  source: text("source").notNull(),
  url: text("url").notNull(),
  recordId: text("record_id").notNull(),
  retrievedAt: text("retrieved_at").notNull(),
  contentHash: text("content_hash").notNull(),
  excerpt: text("excerpt"),
  createdAt: text("created_at").notNull(),
});

export const activity = table("rs_activity", {
  id: text("id").primaryKey(),
  ownerEmail: text("owner_email").notNull(),
  caseId: text("case_id").notNull(),
  actor: text("actor").notNull(),
  caller: text("caller").notNull(),
  kind: text("kind").notNull(),
  targetId: text("target_id"),
  detail: text("detail"),
  at: text("at").notNull(),
});

export const coverage = table(
  "rs_coverage",
  {
    id: text("id").primaryKey(),
    ownerEmail: text("owner_email").notNull(),
    caseId: text("case_id").notNull(),
    source: text("source").notNull(),
    state: text("state").notNull(),
    note: text("note").notNull(),
  },
  (t) => ({
    caseSource: uniqueIndex("idx_rs_coverage_case_source").on(
      t.caseId,
      t.source,
    ),
  }),
);

export const suggestions = table("rs_suggestions", {
  id: text("id").primaryKey(),
  ownerEmail: text("owner_email").notNull(),
  caseId: text("case_id").notNull(),
  targetId: text("target_id").notNull(),
  reason: text("reason").notNull(),
  status: text("status").notNull(),
  createdAt: text("created_at").notNull(),
});

export const watches = table("rs_watches", {
  id: text("id").primaryKey(),
  ownerEmail: text("owner_email").notNull(),
  caseId: text("case_id").notNull(),
  nodeId: text("node_id").notNull(),
  companyNumber: text("company_number").notNull(),
  createdAt: text("created_at").notNull(),
});

export const snapshots = table("rs_snapshots", {
  id: text("id").primaryKey(),
  ownerEmail: text("owner_email").notNull(),
  watchId: text("watch_id").notNull(),
  officersHash: text("officers_hash").notNull(),
  controllersHash: text("controllers_hash").notNull(),
  filingsHash: text("filings_hash").notNull(),
  filingCount: integer("filing_count").notNull(),
  takenAt: text("taken_at").notNull(),
});

export const changes = table("rs_changes", {
  id: text("id").primaryKey(),
  ownerEmail: text("owner_email").notNull(),
  caseId: text("case_id").notNull(),
  watchId: text("watch_id").notNull(),
  kind: text("kind").notNull(),
  summary: text("summary").notNull(),
  status: text("status").notNull(),
  createdAt: text("created_at").notNull(),
});

// `bucket` is `YYYY-MM-DD` for daily caps and `w:<key>:<windowStartMs>` for
// window limiters (Task 6).
export const usage = table(
  "rs_usage",
  {
    id: text("id").primaryKey(),
    ownerEmail: text("owner_email").notNull(),
    kind: text("kind").notNull(),
    bucket: text("bucket").notNull(),
    count: integer("count").notNull().default(0),
  },
  (t) => ({
    ownerKindBucket: uniqueIndex("idx_rs_usage_owner_kind_bucket").on(
      t.ownerEmail,
      t.kind,
      t.bucket,
    ),
  }),
);
