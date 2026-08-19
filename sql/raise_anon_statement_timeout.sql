-- Root-cause fix for the ~15s ceiling on live dashboard_breakdown() calls:
-- the app talks to Supabase with only the public "apikey" header (no JWT),
-- so PostgREST always executes as the `anon` role, which had
-- statement_timeout=8s (authenticated) / 15s (anon) configured directly on
-- the role (confirmed via `select rolname, rolconfig from pg_roles`) -- a
-- fixed deadline latched at the start of the top-level RPC call, which a
-- `SET LOCAL statement_timeout` *inside* dashboard_breakdown() could never
-- override (Postgres does not re-arm an already-running statement's
-- timeout). Raise it well above the ~40s worst-case observed for the
-- slowest live query (Προμήθειες, 124k rows) so any Τύπος σύμβασης
-- combination can run live instead of only single-value cache hits.
alter role anon set statement_timeout = '60s';
alter role authenticated set statement_timeout = '60s';

select rolname, rolconfig from pg_roles where rolname in ('anon', 'authenticated');
