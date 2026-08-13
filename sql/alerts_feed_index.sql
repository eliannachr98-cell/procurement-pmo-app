-- CREATE INDEX CONCURRENTLY can't run inside a transaction block (or
-- alongside other statements in the same batch) - kept in its own file so
-- the runner executes it as a single standalone statement, separate from
-- sql/alerts_feed.sql's function body.
create index concurrently if not exists record_cpvs_compact_type_code_idx
  on public.record_cpvs_compact (record_type, cpv_code);
