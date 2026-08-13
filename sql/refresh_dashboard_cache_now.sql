-- One-off trigger to repopulate dashboard_cache with the current
-- refresh_dashboard_caches() definition (run after changing that function,
-- e.g. sql/dashboard_aggregates.sql) so the cached (no-filter/year-only)
-- path picks up the new JSON shape immediately instead of on the next
-- unrelated write.
--
-- The function loops once per year plus "all", each pass scanning the full
-- table -- the runner's default 120s statement_timeout isn't enough
-- headroom for that cumulative cost, so raise it just for this call.
set statement_timeout = '280000';
select public.refresh_dashboard_caches();
