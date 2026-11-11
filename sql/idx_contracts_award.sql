-- Contracts are joined to awards by award_adam (market overview, scope
-- resolution); without an index each join scanned the whole contracts table.
create index concurrently if not exists contracts_compact_award_adam_idx
  on public.contracts_compact (award_adam);
