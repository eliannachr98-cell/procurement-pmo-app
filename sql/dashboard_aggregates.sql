-- Server-side aggregates for the Overview dashboard (status breakdown, CPV
-- distribution, NUTS distribution) and the Έτος filter's year list.
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

drop table if exists public.dashboard_cache;

create table public.dashboard_cache (
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
             p.nuts_name, p.nuts_code
      from public.procurements_compact p
      where target_year is null
         or (p.publication_date >= (target_year || '-01-01')::date and p.publication_date <= (target_year || '-12-31')::date)
    ),
    has_award as (
      select distinct a.procurement_adam as adam
      from public.awards_compact a
      where a.procurement_adam in (select adam from matched)
    ),
    has_contract as (
      select distinct c.procurement_adam as adam
      from public.contracts_compact c
      where c.procurement_adam in (select adam from matched)
    ),
    status_calc as (
      select m.adam, m.nuts_name, m.nuts_code,
        case
          when m.cancelled_at is not null or m.raw_status = 'cancelled' then 'Ακυρωμένος'
          when hc.adam is not null then 'Ολοκληρωμένος'
          when ha.adam is not null then 'Ανατεθειμένος'
          when m.opening_at is not null and m.opening_at < now() then 'Αξιολόγηση'
          else 'Ενεργός'
        end as status
      from matched m
      left join has_award ha on ha.adam = m.adam
      left join has_contract hc on hc.adam = m.adam
    ),
    status_agg as (
      select status, count(*) as n from status_calc group by status
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
    nuts_agg as (
      select coalesce(nuts_name, nuts_code, 'Χωρίς NUTS') as nuts_name, count(*) as n
      from status_calc
      group by 1
      order by n desc
      limit 15
    )
    select json_build_object(
      'total', (select count(*) from matched),
      'status', (select coalesce(json_agg(json_build_object('status', status, 'count', n)), '[]'::json) from status_agg),
      'cpv', (select coalesce(json_agg(json_build_object('cpv_code', cpv_code, 'cpv_description', cpv_description, 'count', n)), '[]'::json) from cpv_agg),
      'nuts', (select coalesce(json_agg(json_build_object('nuts_name', nuts_name, 'count', n)), '[]'::json) from nuts_agg)
    )
    into result;

    insert into public.dashboard_cache (cache_key, payload, refreshed_at)
    values (coalesce(target_year, 'all'), result, now())
    on conflict (cache_key) do update set payload = excluded.payload, refreshed_at = excluded.refreshed_at;
  end loop;
end;
$$;

create or replace function public.dashboard_breakdown(
  p_query text default null,
  p_authority text default null,
  p_year text default null,
  p_contract_type text default null,
  p_document_type text default null,
  p_adams text[] default null
)
returns json
language plpgsql stable as $$
declare
  result json;
  only_year_filter boolean;
begin
  only_year_filter := p_adams is null and p_query is null and p_authority is null
    and p_contract_type is null and p_document_type is null;

  if only_year_filter then
    select payload into result from public.dashboard_cache where cache_key = coalesce(p_year, 'all');
    if found then
      return result;
    end if;
  end if;

  with matched as (
    select p.adam, p.opening_at, p.cancelled_at, p.status as raw_status,
           p.nuts_name, p.nuts_code
    from public.procurements_compact p
    where (p_adams is null or p.adam = any(p_adams))
      and (p_query is null or p.adam ilike '%' || p_query || '%' or p.title ilike '%' || p_query || '%')
      and (p_authority is null or p.authority_name ilike '%' || p_authority || '%')
      and (p_year is null or (p.publication_date >= (p_year || '-01-01')::date and p.publication_date <= (p_year || '-12-31')::date))
      and (p_contract_type is null or p.contract_type = p_contract_type)
      and (p_document_type is null or p.document_category = p_document_type)
  ),
  has_award as (
    select distinct a.procurement_adam as adam
    from public.awards_compact a
    where a.procurement_adam in (select adam from matched)
  ),
  has_contract as (
    select distinct c.procurement_adam as adam
    from public.contracts_compact c
    where c.procurement_adam in (select adam from matched)
  ),
  status_calc as (
    select m.adam, m.nuts_name, m.nuts_code,
      case
        when m.cancelled_at is not null or m.raw_status = 'cancelled' then 'Ακυρωμένος'
        when hc.adam is not null then 'Ολοκληρωμένος'
        when ha.adam is not null then 'Ανατεθειμένος'
        when m.opening_at is not null and m.opening_at < now() then 'Αξιολόγηση'
        else 'Ενεργός'
      end as status
    from matched m
    left join has_award ha on ha.adam = m.adam
    left join has_contract hc on hc.adam = m.adam
  ),
  status_agg as (
    select status, count(*) as n from status_calc group by status
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
  nuts_agg as (
    select coalesce(nuts_name, nuts_code, 'Χωρίς NUTS') as nuts_name, count(*) as n
    from status_calc
    group by 1
    order by n desc
    limit 15
  )
  select json_build_object(
    'total', (select count(*) from matched),
    'status', (select coalesce(json_agg(json_build_object('status', status, 'count', n)), '[]'::json) from status_agg),
    'cpv', (select coalesce(json_agg(json_build_object('cpv_code', cpv_code, 'cpv_description', cpv_description, 'count', n)), '[]'::json) from cpv_agg),
    'nuts', (select coalesce(json_agg(json_build_object('nuts_name', nuts_name, 'count', n)), '[]'::json) from nuts_agg)
  )
  into result;

  return result;
end;
$$;
