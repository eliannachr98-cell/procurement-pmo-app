-- Draft compact schema for TenderScope.
-- Safe to review: it creates new tables and does not touch the legacy tables.

create table if not exists public.procurements_compact (
  adam text primary key,
  title text not null,
  authority_id text,
  authority_name text,
  contract_type text,
  procedure_type text,
  document_category text not null default 'other',
  nuts_code text,
  nuts_name text,
  publication_date date,
  opening_at timestamptz,
  budget_ex_vat numeric(16,2),
  budget_inc_vat numeric(16,2),
  budget_unknown_vat numeric(16,2),
  status text not null default 'active',
  cancelled_at date,
  source_updated_at timestamptz,
  synced_at timestamptz not null default now(),
  constraint procurements_budget_nonnegative check (
    coalesce(budget_ex_vat, 0) >= 0 and
    coalesce(budget_inc_vat, 0) >= 0 and
    coalesce(budget_unknown_vat, 0) >= 0
  )
);

create table if not exists public.awards_compact (
  adam text primary key,
  procurement_adam text,
  title text,
  authority_id text,
  authority_name text,
  contract_type text,
  award_date date,
  amount_ex_vat numeric(16,2),
  amount_inc_vat numeric(16,2),
  amount_unknown_vat numeric(16,2),
  cancelled_at date,
  source_updated_at timestamptz,
  synced_at timestamptz not null default now(),
  constraint awards_amount_nonnegative check (
    coalesce(amount_ex_vat, 0) >= 0 and
    coalesce(amount_inc_vat, 0) >= 0 and
    coalesce(amount_unknown_vat, 0) >= 0
  )
);

create table if not exists public.contracts_compact (
  adam text primary key,
  procurement_adam text,
  award_adam text,
  title text,
  authority_id text,
  authority_name text,
  contract_type text,
  signed_date date,
  start_date date,
  delivery_date date,
  amount_ex_vat numeric(16,2),
  amount_inc_vat numeric(16,2),
  amount_unknown_vat numeric(16,2),
  cancelled_at date,
  source_updated_at timestamptz,
  synced_at timestamptz not null default now(),
  constraint contracts_amount_nonnegative check (
    coalesce(amount_ex_vat, 0) >= 0 and
    coalesce(amount_inc_vat, 0) >= 0 and
    coalesce(amount_unknown_vat, 0) >= 0
  )
);

create table if not exists public.record_cpvs_compact (
  record_type text not null check (record_type in ('procurement','award','contract')),
  record_adam text not null,
  cpv_code text not null,
  cpv_description text,
  primary key (record_type, record_adam, cpv_code)
);

create table if not exists public.record_contractors_compact (
  record_type text not null check (record_type in ('award','contract')),
  record_adam text not null,
  position smallint not null default 1,
  contractor_name text not null,
  contractor_vat text,
  primary key (record_type, record_adam, position)
);

create index if not exists procurements_compact_publication_idx on public.procurements_compact (publication_date desc);
create index if not exists procurements_compact_authority_idx on public.procurements_compact (authority_name);
create index if not exists procurements_compact_nuts_idx on public.procurements_compact (nuts_code);
create index if not exists awards_compact_procurement_idx on public.awards_compact (procurement_adam);
create index if not exists contracts_compact_procurement_idx on public.contracts_compact (procurement_adam);
create index if not exists record_cpvs_compact_code_idx on public.record_cpvs_compact (cpv_code);
create index if not exists record_contractors_compact_name_idx on public.record_contractors_compact (contractor_name);

alter table public.procurements_compact enable row level security;
alter table public.awards_compact enable row level security;
alter table public.contracts_compact enable row level security;
alter table public.record_cpvs_compact enable row level security;
alter table public.record_contractors_compact enable row level security;

grant select on public.procurements_compact, public.awards_compact,
  public.contracts_compact, public.record_cpvs_compact,
  public.record_contractors_compact to anon, authenticated;
grant all on public.procurements_compact, public.awards_compact,
  public.contracts_compact, public.record_cpvs_compact,
  public.record_contractors_compact to service_role;

drop policy if exists "public read procurements compact" on public.procurements_compact;
create policy "public read procurements compact" on public.procurements_compact
  for select to anon, authenticated using (true);
drop policy if exists "public read awards compact" on public.awards_compact;
create policy "public read awards compact" on public.awards_compact
  for select to anon, authenticated using (true);
drop policy if exists "public read contracts compact" on public.contracts_compact;
create policy "public read contracts compact" on public.contracts_compact
  for select to anon, authenticated using (true);
drop policy if exists "public read cpvs compact" on public.record_cpvs_compact;
create policy "public read cpvs compact" on public.record_cpvs_compact
  for select to anon, authenticated using (true);
drop policy if exists "public read contractors compact" on public.record_contractors_compact;
create policy "public read contractors compact" on public.record_contractors_compact
  for select to anon, authenticated using (true);


