-- Read-through cache for the numbers of one set of followed interests (the
-- Η αγορά μου scope); filled by the API, valid until the next data sync.
create table if not exists public.scope_cache (
  cache_key text primary key,
  payload json not null,
  refreshed_at timestamptz not null default now()
);
