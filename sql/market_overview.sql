-- Aggregates for the "Αγορά" and "Ανταγωνισμός" blocks of the Overview.
--
-- Rules (the same ones the contractor profile uses in the app):
--  * only awards/contracts linked to a notice in the matched set count;
--  * a contract counts, and an award counts only if no contract came from it;
--  * the same amount republished for the same notice counts once;
--  * a discount is computed only for notices with exactly one distinct
--    awarded amount, on the same VAT basis as the budget, not above it.
--
-- p_stats_only joins procurement_quality_flags.in_stats (the thesis Excel
-- rules). It is off by default until those rules are final.
--
-- Filter values are embedded as literals (format %L), same as
-- dashboard_breakdown, so Postgres plans for the actual values.

create or replace function public.market_overview(
  p_year text default null,
  p_authority text default null,
  p_contract_type text[] default null,
  p_adams text[] default null,
  p_stats_only boolean default false
)
returns json
language plpgsql stable as $$
declare
  conditions text[] := array['p.document_category = ''declaration'''];
  join_flags text := '';
  result json;
begin
  if p_adams is not null then
    conditions := conditions || format('p.adam = any(%L::text[])', p_adams);
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
  if p_stats_only then
    -- The thesis Excel rules: only noticeType "Διακήρυξη", no amendment/
    -- extension/... titles (accent-insensitive, like the Excel), not a
    -- cancelled notice without an award, and a sane opening date.
    join_flags := 'join public.procurement_quality_flags f on f.adam = p.adam and f.notice_type_key = ''3'' and not f.cancelled_no_award and not f.date_issue and not (translate(upper(p.title), ''ΆΈΉΊΌΎΏΪΫ'', ''ΑΕΗΙΟΥΩΙΥ'') ~ ''ΑΠΟΦΑΣ|ΤΡΟΠΟΠ|ΠΑΡΑΤΑΣ|ΔΙΕΥΚΡ|ΜΑΤΑΙΩ|ΔΙΟΡΘΩ|ΑΝΑΡΤΗΣ|ΠΕΡΙΛΗΨ|ΜΕΤΑΘΕΣ|ΠΡΟΣΦΥΓ|ΑΕΠΠ'')';
  end if;

  execute format($q$
    with matched as (
      select p.adam, p.authority_name, p.contract_type,
             coalesce(nullif(p.budget_inc_vat, 0), nullif(p.budget_ex_vat, 0), nullif(p.budget_unknown_vat, 0)) as budget,
             case when p.budget_inc_vat > 0 then 'inc' when p.budget_ex_vat > 0 then 'ex' when p.budget_unknown_vat > 0 then 'unknown' end as budget_basis
      from public.procurements_compact p
      %s
      where %s
    ),
    aw as (
      select a.adam, a.procurement_adam as n,
             coalesce(nullif(a.amount_inc_vat, 0), nullif(a.amount_ex_vat, 0), nullif(a.amount_unknown_vat, 0), 0) as amt,
             case when a.amount_inc_vat > 0 then 'inc' when a.amount_ex_vat > 0 then 'ex' when a.amount_unknown_vat > 0 then 'unknown' end as basis
      from public.awards_compact a
      where a.procurement_adam in (select adam from matched)
    ),
    -- Start from the contracts of the matched notices (directly, or through
    -- their awards) so the cost follows the filter instead of scanning every
    -- contract in the table.
    ct_ids as (
      select c.adam from public.contracts_compact c where c.procurement_adam in (select adam from matched)
      union
      select c.adam from public.contracts_compact c where c.award_adam in (select adam from aw)
    ),
    ct as (
      select c.adam, coalesce(c.procurement_adam, a.n) as n, c.award_adam,
             coalesce(nullif(c.amount_inc_vat, 0), nullif(c.amount_ex_vat, 0), nullif(c.amount_unknown_vat, 0), 0) as amt,
             case when c.amount_inc_vat > 0 then 'inc' when c.amount_ex_vat > 0 then 'ex' when c.amount_unknown_vat > 0 then 'unknown' end as basis
      from public.contracts_compact c
      join ct_ids i on i.adam = c.adam
      left join aw a on a.adam = c.award_adam
    ),
    contracted as (select distinct award_adam from ct where award_adam is not null),
    doc as (
      select 'contract'::text as kind, adam, n, amt, basis from ct
      union all
      select 'award'::text, adam, n, amt, basis from aw where adam not in (select award_adam from contracted)
    ),
    doc_amounts as (
      select n, amt, min(kind) as kind from doc where amt > 0 group by n, amt
    ),
    dc as (
      select d.kind, d.n, d.amt,
             coalesce(nullif(trim(rc.contractor_vat), ''), rc.contractor_name) as ckey,
             rc.contractor_name
      from doc d
      join public.record_contractors_compact rc on rc.record_adam = d.adam and rc.record_type = d.kind
      where d.amt > 0
    ),
    by_contractor_rows as (
      select ckey, max(contractor_name) as name, n, amt, min(kind) as kind
      from dc group by ckey, n, amt
    ),
    contractor_totals as (
      select ckey, max(name) as name, count(*) filter (where kind = 'award') as awards,
             count(*) filter (where kind = 'contract') as contracts, sum(amt) as value
      from by_contractor_rows group by ckey
    ),
    top_contractors as (select * from contractor_totals order by (awards + contracts) desc, value desc limit 10),
    authority_totals as (
      select m.authority_name, count(distinct da.n) as tenders, sum(da.amt) as value
      from doc_amounts da join matched m on m.adam = da.n
      group by m.authority_name
    ),
    disc as (
      select m.adam, m.contract_type, 1 - (min(d.amt) / m.budget) as dsc
      from matched m
      join doc d on d.n = m.adam
      where d.amt > 0 and m.budget > 0 and d.basis in ('inc', 'ex') and d.basis = m.budget_basis
      group by m.adam, m.contract_type, m.budget
      having count(distinct d.amt) = 1 and count(distinct d.basis) = 1 and min(d.amt) <= m.budget
    ),
    top5 as (select coalesce(sum(value), 0) as v from (select value from contractor_totals order by value desc limit 5) t),
    dcf as (
      select kind, n, amt, ckey, contractor_name,
             case
               when nm ~ 'PRICEWATER|PWC|ΠΡΑΙΣΓΟΥΟΤΕΡ' then 'PwC'
               when nm ~ 'DELOITTE|ΝΤΕΛΟΙΤ' then 'Deloitte'
               when nm ~ 'ERNST|ΕΡΝΣΤ' then 'EY'
               when nm ~ 'KPMG' then 'KPMG'
             end as firm
      from (select dc.*, translate(upper(dc.contractor_name), 'ΆΈΉΊΌΎΏΪΫ', 'ΑΕΗΙΟΥΩΙΥ') as nm from dc) x
    ),
    firm_rows as (
      select firm, n, amt, min(kind) as kind
      from dcf where firm is not null
      group by firm, n, amt
    ),
    cons as (
      select distinct c.record_adam as n
      from public.record_cpvs_compact c
      join matched m on m.adam = c.record_adam
      where c.record_type = 'procurement' and left(c.cpv_code, 2) = '79'
    ),
    cons_rows as (
      select ckey, max(contractor_name) as name, n, amt, min(kind) as kind, bool_or(firm is not null) as is_big4
      from dcf where n in (select n from cons)
      group by ckey, n, amt
    ),
    cons_totals as (
      select ckey, max(name) as name,
             count(*) filter (where kind = 'award') as awards,
             count(*) filter (where kind = 'contract') as contracts,
             sum(amt) as value
      from cons_rows where not is_big4
      group by ckey
    ),
    top_cons as (
      select t.*, (select avg(d.dsc) * 100 from (select distinct r.n from cons_rows r where r.ckey = t.ckey) q join disc d on d.adam = q.n) as discount
      from (select * from cons_totals order by (awards + contracts) desc, value desc limit 10) t
    ),
    firm_cpv as (
      select fr.firm, c.cpv_code, max(c.cpv_description) as descr, count(distinct fr.n) as tenders, sum(fr.amt) as value
      from firm_rows fr
      join public.record_cpvs_compact c on c.record_type = 'procurement' and c.record_adam = fr.n
      group by fr.firm, c.cpv_code
    ),
    firm_cpv_top as (
      select *, row_number() over (partition by firm order by tenders desc, value desc) as rn from firm_cpv
    ),
    big4 as (
      select f.firm,
             count(*) filter (where f.kind = 'award') as awards,
             count(*) filter (where f.kind = 'contract') as contracts,
             coalesce(sum(f.amt), 0) as value,
             (select count(*) from (select distinct fr.n from firm_rows fr where fr.firm = f.firm) q join disc d on d.adam = q.n) as discount_count,
             (select avg(d.dsc) * 100 from (select distinct fr.n from firm_rows fr where fr.firm = f.firm) q join disc d on d.adam = q.n) as discount_avg
      from firm_rows f
      group by f.firm
    )
    select json_build_object(
      'tenders', (select count(*) from matched),
      'tendersWithAwards', (select count(distinct n) from doc_amounts),
      'contractors', (select count(*) from contractor_totals),
      'awards', (select count(*) from doc_amounts where kind = 'award'),
      'contracts', (select count(*) from doc_amounts where kind = 'contract'),
      'value', (select coalesce(sum(amt), 0) from doc_amounts),
      'awardsValue', (select coalesce(sum(amt), 0) from doc_amounts where kind = 'award'),
      'contractsValue', (select coalesce(sum(amt), 0) from doc_amounts where kind = 'contract'),
      'topContractors', (select coalesce(json_agg(json_build_object('name', name, 'awards', awards, 'contracts', contracts, 'total', awards + contracts, 'value', value) order by (awards + contracts) desc, value desc), '[]'::json) from top_contractors),
      'topAuthorities', (select coalesce(json_agg(json_build_object('authority', authority_name, 'tenders', tenders, 'value', value) order by tenders desc, value desc), '[]'::json) from (select * from authority_totals order by tenders desc, value desc limit 10) t),
      'concentrationTop5', (select case when (select sum(value) from contractor_totals) > 0 then (select v from top5) / (select sum(value) from contractor_totals) else null end),
      'discount', (select json_build_object('count', count(*), 'average', avg(dsc) * 100, 'median', percentile_cont(0.5) within group (order by dsc) * 100, 'positiveShare', case when count(*) > 0 then 100.0 * count(*) filter (where dsc > 0.0005) / count(*) else null end) from disc),
      'bigFour', (select coalesce(json_agg(json_build_object('name', b.name, 'awards', coalesce(x.awards, 0), 'contracts', coalesce(x.contracts, 0), 'value', coalesce(x.value, 0), 'discount', x.discount_avg, 'discountCount', coalesce(x.discount_count, 0)) order by b.ord), '[]'::json) from (values ('PwC', 1), ('Deloitte', 2), ('EY', 3), ('KPMG', 4)) as b(name, ord) left join big4 x on x.firm = b.name),
      'consulting', json_build_object(
        'tenders', (select count(distinct n) from doc_amounts where n in (select n from cons)),
        'docs', (select count(*) from doc_amounts where n in (select n from cons)),
        'value', (select coalesce(sum(amt), 0) from doc_amounts where n in (select n from cons)),
        'big4Docs', (select count(*) from firm_rows where n in (select n from cons)),
        'big4Value', (select coalesce(sum(amt), 0) from firm_rows where n in (select n from cons)),
        'firms', (select coalesce(json_agg(json_build_object('name', b.name, 'docs', coalesce(s.docs, 0), 'value', coalesce(s.value, 0)) order by b.ord), '[]'::json) from (values ('PwC', 1), ('Deloitte', 2), ('EY', 3), ('KPMG', 4)) as b(name, ord) left join (select firm, count(*) as docs, sum(amt) as value from firm_rows where n in (select n from cons) group by firm) s on s.firm = b.name),
        'others', (select coalesce(json_agg(json_build_object('name', name, 'awards', awards, 'contracts', contracts, 'value', value, 'discount', discount) order by (awards + contracts) desc, value desc), '[]'::json) from top_cons)
      ),
      'bigFourCpv', (select coalesce(json_agg(json_build_object('name', b.name, 'cpvs', (select coalesce(json_agg(json_build_object('code', t.cpv_code, 'description', t.descr, 'tenders', t.tenders, 'value', t.value) order by t.rn), '[]'::json) from firm_cpv_top t where t.firm = b.name and t.rn <= 5)) order by b.ord), '[]'::json) from (values ('PwC', 1), ('Deloitte', 2), ('EY', 3), ('KPMG', 4)) as b(name, ord)),
      'discountByType', (select coalesce(json_agg(json_build_object('type', contract_type, 'count', cnt, 'average', avg_dsc) order by cnt desc), '[]'::json) from (select contract_type, count(*) as cnt, avg(dsc) * 100 as avg_dsc from disc group by contract_type) t)
    )
  $q$, join_flags, array_to_string(conditions, ' and ')) into result;

  return result;
end;
$$;

-- A year (or no filter) on its own is too heavy to compute per request
-- (about a minute per year), so those views are precomputed here, the same way
-- dashboard_cache works. Anything narrower is computed live by the function.
create table if not exists public.market_overview_cache (
  cache_key text primary key,
  payload json not null,
  refreshed_at timestamptz not null default now()
);

alter table public.market_overview_cache enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'market_overview_cache' and policyname = 'market_overview_cache_select') then
    create policy market_overview_cache_select on public.market_overview_cache for select using (true);
  end if;
end $$;

create or replace function public.refresh_market_overview_cache()
returns void
language plpgsql as $$
declare
  y text;
begin
  for y in select year from public.available_years() union all select null::text loop
    insert into public.market_overview_cache (cache_key, payload)
    values (coalesce(y, 'all'), public.market_overview(y, null, null, null, true))
    on conflict (cache_key) do update set payload = excluded.payload, refreshed_at = now();
  end loop;
end;
$$;
