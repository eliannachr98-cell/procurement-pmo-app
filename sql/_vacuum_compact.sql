-- The heavy backfill inserts/upserts left the visibility map stale, forcing
-- index-only scans to fall back to heap fetches (~70k extra page reads on
-- awards_compact alone, per EXPLAIN ANALYZE). Refresh stats and visibility.
vacuum analyze public.procurements_compact;
vacuum analyze public.awards_compact;
vacuum analyze public.contracts_compact;
vacuum analyze public.record_cpvs_compact;
vacuum analyze public.record_contractors_compact;
