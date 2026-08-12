select clock_timestamp() as started;
select public.refresh_dashboard_caches();
select clock_timestamp() as finished, payload->'total' as total, refreshed_at from public.dashboard_cache;
