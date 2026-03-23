import {
  boolean,
  integer,
  jsonb,
  pgSchema,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'

const solemd = pgSchema('solemd')

export const graphRuns = solemd.table('graph_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  graphName: varchar('graph_name', { length: 128 }).notNull(),
  nodeKind: varchar('node_kind', { length: 64 }).notNull(),
  status: varchar('status', { length: 32 }).notNull(),
  isCurrent: boolean('is_current').notNull().default(false),
  bundleUri: text('bundle_uri').notNull(),
  bundleFormat: varchar('bundle_format', { length: 32 }).notNull(),
  bundleVersion: varchar('bundle_version', { length: 32 }).notNull(),
  bundleChecksum: varchar('bundle_checksum', { length: 128 }).notNull(),
  bundleBytes: integer('bundle_bytes'),
  bundleManifest: jsonb('bundle_manifest'),
  qaSummary: jsonb('qa_summary'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})
