-- Root-cause fix for the ~15s ceiling on live dashboard_breakdown() calls:
-- the app talks to Supabase with only the public "apikey" header (no JWT),
-- so PostgREST always executes as the `anon` role, which had
-- statement_timeout=8s (authenticated) / 15s (anon) configured directly on
-- the role (confirmed via `select rolname, rolconfig from pg_roles`) -- a
-- fixed deadline latched at the start of the top-level RPC call, which a
-- `SET LOCAL statement_timeout` *inside* dashboard_breakdown() could never
-- override (Postgres does not re-arm an already-running statement's
-- timeout). First raised to 60s (enough for any single Τύπος σύμβασης
-- value, ~40s worst case), but combining two large categories (e.g.
-- Προμήθειες + Υπηρεσίες, ~200k matched rows) still hit 60s live -
-- raised again to 120s to cover multi-select combinations too.
alter role anon set statement_timeout = '120s';
alter role authenticated set statement_timeout = '120s';

select rolname, rolconfig from pg_roles where rolname in ('anon', 'authenticated');
