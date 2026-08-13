-- One-off trigger to repopulate dashboard_cache with the current
-- refresh_dashboard_caches() definition (run after changing that function,
-- e.g. sql/dashboard_aggregates.sql) so the cached (no-filter/year-only)
-- path picks up the new JSON shape immediately instead of on the next
-- unrelated write.
select public.refresh_dashboard_caches();
