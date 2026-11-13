-- Ready-made numbers for the "Αγορά" and "Ανταγωνισμός" blocks, for ANY filter.
--
-- market_overview() recomputes everything (awards, contracts, contractors,
-- discounts) from the big tables on every request, which is why only a whole
-- year or "all" could be served (from market_overview_cache) and every narrower
-- view (a profile's CPVs + regions, a contractor, an authority) took tens of
-- seconds. These two tables hold the result of that work ONCE per notice:
--
--   market_tender_facts      one row per counted notice (noticeType 3 declaration):
--                            its authority, type, region, budget, how many awards /
--                            contracts and their value, and its discount.
--   market_contractor_facts  one row per (contractor, notice, amount): who got what.
--
-- market_overview_fast() has the same inputs and the same JSON output as
-- market_overview(), but only reads these tables, so a scope of any size is
-- answered in well under a second. refresh_market_facts() rebuilds both tables
-- with exactly the rules of market_overview (see sql/market_overview.sql):
--   * a contract counts, and an award counts only if no contract came from it;
--   * the same amount republished for the same notice counts once;
--   * a discount only for notices with exactly one distinct awarded amount, on
--     the same VAT basis as the budget, not above it.
-- It runs after the daily sync (a few minutes; readers keep seeing the old
-- numbers until it commits).

create table if not exists public.market_tender_facts (
  adam text primary key,
  publication_date date,
  authority_name text,
  contract_type text,
  nuts_code text,
  budget numeric,
  budget_basis text,
  awards_n integer not null default 0,
  contracts_n integer not null default 0,
  awards_value numeric not null default 0,
  contracts_value numeric not null default 0,
  discount numeric
);

create table if not exists public.market_contractor_facts (
  ckey text not null,
  contractor_name text,
  n text not null,
  amt numeric not null,
  kind text not null,
  members integer not null default 1,
  amt_share numeric,
  primary key (ckey, n, amt)
);

alter table public.market_contractor_facts add column if not exists members integer not null default 1;
alter table public.market_contractor_facts add column if not exists amt_share numeric;

create index if not exists market_contractor_facts_n_idx on public.market_contractor_facts (n);
create index if not exists market_tender_facts_pub_idx on public.market_tender_facts (publication_date);
create index if not exists market_tender_facts_authority_idx on public.market_tender_facts (authority_name);

alter table public.market_tender_facts enable row level security;
alter table public.market_contractor_facts enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'market_tender_facts' and policyname = 'market_tender_facts_select') then
    create policy market_tender_facts_select on public.market_tender_facts for select using (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'market_contractor_facts' and policyname = 'market_contractor_facts_select') then
    create policy market_contractor_facts_select on public.market_contractor_facts for select using (true);
  end if;
end $$;

create or replace function public.refresh_market_facts()
returns void
language plpgsql as $$
begin
  set local statement_timeout = 0;

  create temp table _m on commit drop as
    select p.adam, p.authority_name, p.contract_type, p.nuts_code, p.publication_date,
           coalesce(nullif(p.budget_inc_vat, 0), nullif(p.budget_ex_vat, 0), nullif(p.budget_unknown_vat, 0)) as budget,
           case when p.budget_inc_vat > 0 then 'inc' when p.budget_ex_vat > 0 then 'ex' when p.budget_unknown_vat > 0 then 'unknown' end as budget_basis
    from public.procurements_compact p
    join public.procurement_quality_flags f on f.adam = p.adam and f.notice_type_key = '3'
    where p.document_category = 'declaration';
  create unique index on _m (adam);
  analyze _m;

  create temp table _aw on commit drop as
    select a.adam, a.procurement_adam as n,
           coalesce(nullif(a.amount_inc_vat, 0), nullif(a.amount_ex_vat, 0), nullif(a.amount_unknown_vat, 0), 0) as amt,
           case when a.amount_inc_vat > 0 then 'inc' when a.amount_ex_vat > 0 then 'ex' when a.amount_unknown_vat > 0 then 'unknown' end as basis
    from public.awards_compact a
    where a.procurement_adam in (select adam from _m);
  create index on _aw (adam);
  analyze _aw;

  create temp table _ct on commit drop as
    with ct_ids as (
      select c.adam from public.contracts_compact c where c.procurement_adam in (select adam from _m)
      union
      select c.adam from public.contracts_compact c where c.award_adam in (select adam from _aw)
    )
    select c.adam, coalesce(c.procurement_adam, a.n) as n, c.award_adam,
           coalesce(nullif(c.amount_inc_vat, 0), nullif(c.amount_ex_vat, 0), nullif(c.amount_unknown_vat, 0), 0) as amt,
           case when c.amount_inc_vat > 0 then 'inc' when c.amount_ex_vat > 0 then 'ex' when c.amount_unknown_vat > 0 then 'unknown' end as basis
    from public.contracts_compact c
    join ct_ids i on i.adam = c.adam
    left join _aw a on a.adam = c.award_adam;
  analyze _ct;

  create temp table _doc on commit drop as
    select 'contract'::text as kind, adam, n, amt, basis from _ct
    union all
    select 'award'::text, adam, n, amt, basis from _aw
    where adam not in (select award_adam from _ct where award_adam is not null);
  create index on _doc (n);
  analyze _doc;

  create temp table _da on commit drop as
    select n, amt, min(kind) as kind from _doc where amt > 0 group by n, amt;
  create index on _da (n);

  create temp table _dc on commit drop as
    select coalesce(nullif(trim(rc.contractor_vat), ''), rc.contractor_name) as ckey,
           nullif(regexp_replace(rc.contractor_name, '^[«»"''“”[:space:]]+|[«»"''“”[:space:]]+$', '', 'g'), '') as contractor_name, d.n, d.amt, d.kind
    from _doc d
    join public.record_contractors_compact rc on rc.record_adam = d.adam and rc.record_type = d.kind
    where d.amt > 0;
  delete from _dc where ckey is null;

  -- One company is often spelled in many ways in the source (full name, "Α.Ε.",
  -- typos). The name shown is the most frequent spelling per key, not the
  -- alphabetically last one.
  create temp table _names on commit drop as
    select distinct on (ckey) ckey, contractor_name
    from (select ckey, contractor_name, count(*) as c from _dc where contractor_name is not null group by ckey, contractor_name) x
    order by ckey, c desc, length(contractor_name), contractor_name;

  create temp table _byc on commit drop as
    select g.*, count(*) over (partition by g.n, g.amt) as members from (
    select d.ckey, coalesce(max(nm.contractor_name), max(d.contractor_name)) as contractor_name, d.n, d.amt, min(d.kind) as kind
    from _dc d
    left join _names nm on nm.ckey = d.ckey
    group by d.ckey, d.n, d.amt
    ) g;

  create temp table _disc on commit drop as
    select m.adam, 1 - (min(d.amt) / m.budget) as dsc
    from _m m
    join _doc d on d.n = m.adam
    where d.amt > 0 and m.budget > 0 and d.basis in ('inc', 'ex') and d.basis = m.budget_basis
    group by m.adam, m.budget
    having count(distinct d.amt) = 1 and count(distinct d.basis) = 1 and min(d.amt) <= m.budget;

  delete from public.market_tender_facts;
  insert into public.market_tender_facts
    (adam, publication_date, authority_name, contract_type, nuts_code, budget, budget_basis,
     awards_n, contracts_n, awards_value, contracts_value, discount)
  select m.adam, m.publication_date, m.authority_name, m.contract_type, m.nuts_code, m.budget, m.budget_basis,
         coalesce(da.awards_n, 0), coalesce(da.contracts_n, 0),
         coalesce(da.awards_value, 0), coalesce(da.contracts_value, 0), d.dsc
  from _m m
  left join (
    select n,
           count(*) filter (where kind = 'award') as awards_n,
           count(*) filter (where kind = 'contract') as contracts_n,
           coalesce(sum(amt) filter (where kind = 'award'), 0) as awards_value,
           coalesce(sum(amt) filter (where kind = 'contract'), 0) as contracts_value
    from _da group by n
  ) da on da.n = m.adam
  left join _disc d on d.adam = m.adam;

  delete from public.market_contractor_facts;
  insert into public.market_contractor_facts (ckey, contractor_name, n, amt, kind, members, amt_share)
  select ckey, contractor_name, n, amt, kind, members, amt / members from _byc
  where n in (select adam from _m);

  analyze public.market_tender_facts;
  analyze public.market_contractor_facts;
end;
$$;

drop function if exists public.market_overview_fast(text, text, text[], text[], boolean, text[], text[], text[], text[], text[]);

create or replace function public.market_overview_fast(
  p_year text default null,
  p_authority text default null,
  p_contract_type text[] default null,
  p_adams text[] default null,
  p_stats_only boolean default true,
  p_track text[] default null,
  p_scope_cpv text[] default null,
  p_scope_authorities text[] default null,
  p_scope_contractors text[] default null,
  p_scope_nuts text[] default null
)
returns json
language plpgsql stable as $$
declare
  conditions text[] := array['true'];
  scope_sql text;
  result json;
  top_n integer := case when coalesce(cardinality(p_track), 0) > 0 then 10 else 500 end;
begin
  if p_adams is not null then
    conditions := conditions || format('p.adam = any(%L::text[])', p_adams);
  end if;
  if p_scope_cpv is not null or p_scope_authorities is not null or p_scope_contractors is not null then
    scope_sql := public.scope_condition(p_scope_cpv, p_scope_authorities, p_scope_contractors, p_scope_nuts);
    if scope_sql is not null then
      conditions := conditions || scope_sql;
    end if;
  end if;
  if p_authority is not null then
    conditions := conditions || format('p.authority_name ilike %L', '%' || p_authority || '%');
  end if;
  if p_year is not null then
    conditions := conditions || format('p.publication_date >= %L::date and p.publication_date <= %L::date', p_year || '-01-01', p_year || '-12-31');
  end if;
  if p_contract_type is not null then
    conditions := conditions || format('p.contract_type = any(%L::text[])', p_contract_type);
  end if;

  execute replace(format($q$
    with matched as (
      select p.* from public.market_tender_facts p where %s
    ),
    mc as (
      select f.* from public.market_contractor_facts f where f.n in (select adam from matched)
    ),
    contractor_totals as (
      select ckey, max(contractor_name) as name,
             count(*) filter (where kind = 'award') as awards,
             count(*) filter (where kind = 'contract') as contracts,
             sum(coalesce(amt_share, amt)) as value
      from mc group by ckey
    ),
    top_contractors as (select * from contractor_totals order by (awards + contracts) desc, value desc limit @@TOPN@@),
    authority_totals as (
      select authority_name, count(*) as tenders, sum(awards_value + contracts_value) as value
      from matched
      group by authority_name
    ),
    disc as (select adam, contract_type, discount as dsc from matched where discount is not null),
    top5 as (select coalesce(sum(value), 0) as v from (select value from contractor_totals order by value desc limit 5) t),
    track_keys as (
      select k.key, k.ord from unnest(%L::text[]) with ordinality as k(key, ord)
    ),
    track_rows as (
      select tk.key, d.n, d.amt, sum(coalesce(d.amt_share, d.amt)) as share, min(d.kind) as kind, max(d.contractor_name) as cname
      from track_keys tk
      join mc d on (tk.key ~ '^[0-9]{9}$' and d.ckey = tk.key)
                or (tk.key !~ '^[0-9]{9}$' and position(translate(upper(tk.key), 'ΆΈΉΊΌΎΏΪΫ', 'ΑΕΗΙΟΥΩΙΥ') in translate(upper(d.contractor_name), 'ΆΈΉΊΌΎΏΪΫ', 'ΑΕΗΙΟΥΩΙΥ')) > 0)
      group by tk.key, d.n, d.amt
    ),
    tracked as (
      select tk.key, tk.ord,
             max(r.cname) as cname,
             count(*) filter (where r.kind = 'award') as awards,
             count(*) filter (where r.kind = 'contract') as contracts,
             coalesce(sum(r.share), 0) as value,
             (select avg(d2.dsc) * 100 from (select distinct r2.n from track_rows r2 where r2.key = tk.key) q join disc d2 on d2.adam = q.n) as discount
      from track_keys tk
      left join track_rows r on r.key = tk.key
      group by tk.key, tk.ord
    )
    select json_build_object(
      'tenders', (select count(*) from matched),
      'tendersWithAwards', (select count(*) from matched where awards_n + contracts_n > 0),
      'contractors', (select count(*) from contractor_totals),
      'authorities', (select count(distinct authority_name) from matched),
      'awards', (select coalesce(sum(awards_n), 0) from matched),
      'contracts', (select coalesce(sum(contracts_n), 0) from matched),
      'value', (select coalesce(sum(awards_value + contracts_value), 0) from matched),
      'awardsValue', (select coalesce(sum(awards_value), 0) from matched),
      'contractsValue', (select coalesce(sum(contracts_value), 0) from matched),
      'topContractors', (select coalesce(json_agg(json_build_object('name', name, 'awards', awards, 'contracts', contracts, 'total', awards + contracts, 'value', value) order by (awards + contracts) desc, value desc), '[]'::json) from top_contractors),
      'topAuthorities', (select coalesce(json_agg(json_build_object('authority', authority_name, 'tenders', tenders, 'value', value) order by tenders desc, value desc), '[]'::json) from (select * from authority_totals order by tenders desc, value desc limit @@TOPN@@) t),
      'concentrationTop5', (select case when (select sum(value) from contractor_totals) > 0 then (select v from top5) / (select sum(value) from contractor_totals) else null end),
      'discount', (select json_build_object('count', count(*), 'average', avg(dsc) * 100, 'median', percentile_cont(0.5) within group (order by dsc) * 100, 'positiveShare', case when count(*) > 0 then 100.0 * count(*) filter (where dsc > 0.0005) / count(*) else null end) from disc),
      'tracked', (select coalesce(json_agg(json_build_object('key', key, 'name', coalesce(cname, key), 'awards', awards, 'contracts', contracts, 'value', value, 'discount', discount) order by ord), '[]'::json) from tracked),
      'discountByType', (select coalesce(json_agg(json_build_object('type', contract_type, 'count', cnt, 'average', avg_dsc) order by cnt desc), '[]'::json) from (select contract_type, count(*) as cnt, avg(dsc) * 100 as avg_dsc from disc group by contract_type) t)
    )
  $q$, array_to_string(conditions, ' and '), coalesce(p_track, array[]::text[])), '@@TOPN@@', top_n::text) into result;

  return result;
end;
$$;
