-- The tender list orders by publication_date DESC NULLS LAST. The older index is
-- DESC (NULLS FIRST), so Postgres could not use it and scanned and sorted the
-- whole table on every page load. This index matches the ORDER BY.
create index concurrently if not exists procurements_compact_publication_nl_idx
  on public.procurements_compact (publication_date desc nulls last);
