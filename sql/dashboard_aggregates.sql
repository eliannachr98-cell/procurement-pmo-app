-- Server-side aggregates for the Overview dashboard (status breakdown, CPV
-- distribution, NUTS distribution, monthly trend) and the Έτος filter's
-- year list.
--
-- Both the dashboard charts and the year dropdown previously derived their
-- numbers from whatever ~100 rows happened to be loaded in the browser for
-- the current page, not the full filtered result set -- misleading at
-- 260k+ total rows.
--
-- No filters, or just a single year, are by far the most common views and
-- also the most expensive to compute live (a single year can still be most
-- of the table). Both are precomputed into dashboard_cache by
-- refresh_dashboard_caches() and read back here; any other filter
-- combination (CPV, contractor, authority, contract type, search text)
-- computes live, which stays fast because those are normally far more
-- selective. IMPORTANT: calling the aggregation query through a separate
-- SQL function made Postgres choose a far worse plan than running the same
-- query inline (>120s vs ~18s, confirmed via EXPLAIN ANALYZE) -- the
-- functions below always inline the full query themselves.

create table if not exists public.dashboard_cache (
  cache_key text primary key,
  payload json not null,
  refreshed_at timestamptz not null default now()
);

create or replace function public.available_years()
returns table(year text)
language sql stable as $$
  select distinct extract(year from publication_date)::text as year
  from public.procurements_compact
  where publication_date is not null
  order by 1 desc;
$$;

create or replace function public.refresh_dashboard_caches()
returns void
language plpgsql as $$
declare
  result json;
  target_year text;
begin
  for target_year in select year from public.available_years() union all select null loop
    with matched as (
      select p.adam, p.opening_at, p.cancelled_at, p.status as raw_status,
             p.nuts_name, p.nuts_code, p.publication_date, p.authority_name,
             coalesce(p.budget_inc_vat, p.budget_ex_vat, p.budget_unknown_vat, 0) as budget
      from public.procurements_compact p
      -- Only count original tender notices, not follow-up documents
      -- (amendment/clarification/extension/summary/decision) about the same
      -- tender -- otherwise one tender inflates into several "διαγωνισμοί".
      where p.document_category in ('declaration', 'announcement')
        and (target_year is null
         or (p.publication_date >= (target_year || '-01-01')::date and p.publication_date <= (target_year || '-12-31')::date))
    ),
    has_award as (
      select distinct a.procurement_adam as adam
      from public.awards_compact a
      where a.procurement_adam in (select adam from matched)
    ),
    has_contract as (
      -- A contract's own procurement_adam is often unset - it's still
      -- linked to the notice through its award. Missing that fallback
      -- silently left completed tenders (real signed contract) bucketed as
      -- merely Ανατεθειμένος - confirmed live against actual contract rows.
      select distinct m.adam
      from public.contracts_compact c
      left join public.awards_compact a on a.adam = c.award_adam
      join matched m on m.adam = coalesce(c.procurement_adam, a.procurement_adam)
    ),
    status_calc as (
      select m.adam, m.nuts_name, m.nuts_code, m.budget, m.publication_date, m.authority_name,
        case
          when m.cancelled_at is not null or m.raw_status = 'cancelled' then 'Ακυρωμένος'
          when hc.adam is not null then 'Ολοκληρωμένος'
          when ha.adam is not null then 'Ανατεθειμένος'
          -- A raw opening_at earlier than publication_date is bad source
          -- data, not a real passed deadline (the app-side route applies
          -- the same guard before showing/using this date) - without it, a
          -- notice with no real deadline recorded could still get bucketed
          -- into Αξιολόγηση just because the bogus date is trivially "in
          -- the past".
          when m.opening_at is not null and m.opening_at >= m.publication_date and m.opening_at < now() then 'Αξιολόγηση'
          else 'Ενεργός'
        end as status
      from matched m
      left join has_award ha on ha.adam = m.adam
      left join has_contract hc on hc.adam = m.adam
    ),
    status_agg as (
      select status, count(*) as n, sum(budget) as budget from status_calc group by status
    ),
    cpv_agg as (
      select rc.cpv_code, min(rc.cpv_description) as cpv_description, count(*) as n
      from public.record_cpvs_compact rc
      join matched m on m.adam = rc.record_adam
      where rc.record_type = 'procurement'
      group by rc.cpv_code
      order by n desc
      limit 12
    ),
    -- cpv_agg above is capped at the top 12 for the donut breakdown - the
    -- frontend previously (wrongly) read that array's length as "how many
    -- CPV codes exist", which was always exactly 12. This counts the real
    -- total distinct CPV codes across the matched set instead.
    cpv_total as (
      select count(distinct rc.cpv_code) as n
      from public.record_cpvs_compact rc
      join matched m on m.adam = rc.record_adam
      where rc.record_type = 'procurement'
    ),
    nuts_agg as (
      -- Group by the actual NUTS code (precise region), not just its label --
      -- the map needs the code to place a pin at a real location instead of
      -- guessing from the name text. Records with no specific code (only the
      -- generic country-level "EL") land in their own "XX" bucket.
      select coalesce(nuts_code, 'XX') as nuts_code,
             min(coalesce(nuts_name, nuts_code, 'Χωρίς NUTS')) as nuts_name,
             count(*) as n
      from status_calc
      group by 1
      order by n desc
      limit 20
    ),
    monthly_agg as (
      select to_char(date_trunc('month', publication_date), 'YYYY-MM') as month,
             count(*) as n, sum(budget) as budget, count(distinct authority_name) as authorities
      from status_calc
      where publication_date is not null
      group by 1
    ),
    monthly_cpv as (
      select to_char(date_trunc('month', m.publication_date), 'YYYY-MM') as month,
             count(distinct rc.cpv_code) as n
      from public.record_cpvs_compact rc
      join matched m on m.adam = rc.record_adam
      where rc.record_type = 'procurement' and m.publication_date is not null
      group by 1
    )
    select json_build_object(
      'total', (select count(*) from matched),
      'status', (select coalesce(json_agg(json_build_object('status', status, 'count', n, 'budget', budget)), '[]'::json) from status_agg),
      'cpv', (select coalesce(json_agg(json_build_object('cpv_code', cpv_code, 'cpv_description', cpv_description, 'count', n)), '[]'::json) from cpv_agg),
      'cpvTotal', (select n from cpv_total),
      'nuts', (select coalesce(json_agg(json_build_object('nuts_code', nuts_code, 'nuts_name', nuts_name, 'count', n)), '[]'::json) from nuts_agg),
      'monthly', (
        select coalesce(json_agg(json_build_object(
          'month', ma.month, 'count', ma.n, 'budget', ma.budget,
          'authorities', ma.authorities, 'cpv', coalesce(mc.n, 0)
        ) order by ma.month), '[]'::json)
        from monthly_agg ma
        left join monthly_cpv mc on mc.month = ma.month
      )
    )
    into result;

    insert into public.dashboard_cache (cache_key, payload, refreshed_at)
    values (coalesce(target_year, 'all'), result, now())
    on conflict (cache_key) do update set payload = excluded.payload, refreshed_at = excluded.refreshed_at;
  end loop;
end;
$$;

drop function if exists public.dashboard_breakdown(text, text, text, text, text, text[]);

create or replace function public.dashboard_breakdown(
  p_query text default null,
  p_authority text default null,
  p_year text default null,
  p_contract_type text[] default null,
  p_document_type text default null,
  p_adams text[] default null
)
returns json
language plpgsql stable as $$
declare
  result json;
  only_year_filter boolean;
  conditions text[] := array[]::text[];
  where_sql text := '';
  sql_text text;
begin
  only_year_filter := p_adams is null and p_query is null and p_authority is null
    and p_contract_type is null and p_document_type is null;

  if only_year_filter then
    select payload into result from public.dashboard_cache where cache_key = coalesce(p_year, 'all');
    if found then
      return result;
    end if;
  end if;

  -- Built and run as dynamic SQL with the filter values embedded as literals
  -- (via format(%L)) rather than left as bound parameters. Confirmed via
  -- EXPLAIN ANALYZE: with a trigram index in place, the equivalent literal
  -- query used it and ran in ~2s, but the *same* query with p_authority as a
  -- bound parameter still timed out past 3.4s -- Postgres would not pick the
  -- index-scan plan for it. Rebuilding the WHERE clause as literal text
  -- forces a plan chosen for these actual values on every call.
  if p_adams is not null then
    conditions := conditions || format('p.adam = any(%L::text[])', p_adams);
  end if;
  if p_query is not null then
    conditions := conditions || format('(p.adam ilike %L or p.title ilike %L)', '%' || p_query || '%', '%' || p_query || '%');
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
  if p_document_type is not null then
    conditions := conditions || format('p.document_category = %L', p_document_type);
  else
    -- No explicit document-type filter: default to real tenders only, same
    -- as the cached (unfiltered / year-only) path -- see refresh_dashboard_caches().
    conditions := conditions || $q$p.document_category in ('declaration', 'announcement')$q$::text;
  end if;

  if array_length(conditions, 1) > 0 then
    where_sql := 'where ' || array_to_string(conditions, ' and ');
  end if;

  sql_text := $sql1$
    with matched as (
      select p.adam, p.opening_at, p.cancelled_at, p.status as raw_status,
             p.nuts_name, p.nuts_code, p.publication_date, p.authority_name,
             coalesce(p.budget_inc_vat, p.budget_ex_vat, p.budget_unknown_vat, 0) as budget
      from public.procurements_compact p
  $sql1$ || where_sql || $sql2$
    ),
    has_award as (
      select distinct a.procurement_adam as adam
      from public.awards_compact a
      where a.procurement_adam in (select adam from matched)
    ),
    has_contract as (
      -- A contract's own procurement_adam is often unset - it's still
      -- linked to the notice through its award. Missing that fallback
      -- silently left completed tenders (real signed contract) bucketed as
      -- merely Ανατεθειμένος - confirmed live against actual contract rows.
      select distinct m.adam
      from public.contracts_compact c
      left join public.awards_compact a on a.adam = c.award_adam
      join matched m on m.adam = coalesce(c.procurement_adam, a.procurement_adam)
    ),
    status_calc as (
      select m.adam, m.nuts_name, m.nuts_code, m.budget, m.publication_date, m.authority_name,
        case
          when m.cancelled_at is not null or m.raw_status = 'cancelled' then 'Ακυρωμένος'
          when hc.adam is not null then 'Ολοκληρωμένος'
          when ha.adam is not null then 'Ανατεθειμένος'
          -- A raw opening_at earlier than publication_date is bad source
          -- data, not a real passed deadline (the app-side route applies
          -- the same guard before showing/using this date) - without it, a
          -- notice with no real deadline recorded could still get bucketed
          -- into Αξιολόγηση just because the bogus date is trivially "in
          -- the past".
          when m.opening_at is not null and m.opening_at >= m.publication_date and m.opening_at < now() then 'Αξιολόγηση'
          else 'Ενεργός'
        end as status
      from matched m
      left join has_award ha on ha.adam = m.adam
      left join has_contract hc on hc.adam = m.adam
    ),
    status_agg as (
      select status, count(*) as n, sum(budget) as budget from status_calc group by status
    ),
    cpv_agg as (
      select rc.cpv_code, min(rc.cpv_description) as cpv_description, count(*) as n
      from public.record_cpvs_compact rc
      join matched m on m.adam = rc.record_adam
      where rc.record_type = 'procurement'
      group by rc.cpv_code
      order by n desc
      limit 12
    ),
    cpv_total as (
      select count(distinct rc.cpv_code) as n
      from public.record_cpvs_compact rc
      join matched m on m.adam = rc.record_adam
      where rc.record_type = 'procurement'
    ),
    nuts_agg as (
      select coalesce(nuts_code, 'XX') as nuts_code,
             min(coalesce(nuts_name, nuts_code, 'Χωρίς NUTS')) as nuts_name,
             count(*) as n
      from status_calc
      group by 1
      order by n desc
      limit 20
    ),
    monthly_agg as (
      select to_char(date_trunc('month', publication_date), 'YYYY-MM') as month,
             count(*) as n, sum(budget) as budget, count(distinct authority_name) as authorities
      from status_calc
      where publication_date is not null
      group by 1
    ),
    monthly_cpv as (
      select to_char(date_trunc('month', m.publication_date), 'YYYY-MM') as month,
             count(distinct rc.cpv_code) as n
      from public.record_cpvs_compact rc
      join matched m on m.adam = rc.record_adam
      where rc.record_type = 'procurement' and m.publication_date is not null
      group by 1
    )
    select json_build_object(
      'total', (select count(*) from matched),
      'status', (select coalesce(json_agg(json_build_object('status', status, 'count', n, 'budget', budget)), '[]'::json) from status_agg),
      'cpv', (select coalesce(json_agg(json_build_object('cpv_code', cpv_code, 'cpv_description', cpv_description, 'count', n)), '[]'::json) from cpv_agg),
      'cpvTotal', (select n from cpv_total),
      'nuts', (select coalesce(json_agg(json_build_object('nuts_code', nuts_code, 'nuts_name', nuts_name, 'count', n)), '[]'::json) from nuts_agg),
      'monthly', (
        select coalesce(json_agg(json_build_object(
          'month', ma.month, 'count', ma.n, 'budget', ma.budget,
          'authorities', ma.authorities, 'cpv', coalesce(mc.n, 0)
        ) order by ma.month), '[]'::json)
        from monthly_agg ma
        left join monthly_cpv mc on mc.month = ma.month
      )
    )
  $sql2$;

  execute sql_text into result;
  return result;
end;
$$;
