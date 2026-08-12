-- Server-side aggregates for the Overview dashboard (status breakdown, CPV
-- distribution, NUTS distribution) and the Έτος filter's year list.
--
-- Both the dashboard charts and the year dropdown previously derived their
-- numbers from whatever ~100 rows happened to be loaded in the browser for
-- the current page, not the full filtered result set -- misleading at
-- 260k+ total rows. These functions compute the real thing in the database.

create or replace function public.available_years()
returns table(year text)
language sql stable as $$
  select distinct extract(year from publication_date)::text as year
  from public.procurements_compact
  where publication_date is not null
  order by 1 desc;
$$;

-- The unfiltered CPV distribution (the common case: dashboard loaded with no
-- filters) needs to group ~370k record_cpvs_compact rows, which took ~12s
-- live even after removing an unnecessary DISTINCT -- too slow for
-- PostgREST's request timeout. Precompute it here and refresh after each
-- backfill (see refresh_dashboard_caches()); filtered requests still compute
-- live since a filtered "matched" set is normally far smaller.
create materialized view if not exists public.cpv_notice_counts as
select rc.cpv_code, min(rc.cpv_description) as cpv_description, count(*) as n
from public.record_cpvs_compact rc
where rc.record_type = 'procurement'
group by rc.cpv_code;

create unique index if not exists cpv_notice_counts_code_idx on public.cpv_notice_counts (cpv_code);

create or replace function public.refresh_dashboard_caches()
returns void
language sql as $$
  refresh materialized view concurrently public.cpv_notice_counts;
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
  is_unfiltered boolean;
  v_total bigint;
  v_status json;
  v_nuts json;
  v_cpv json;
begin
  is_unfiltered := p_adams is null and p_query is null and p_authority is null
    and p_year is null and p_contract_type is null and p_document_type is null;

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
  nuts_agg as (
    select coalesce(nuts_name, nuts_code, 'Χωρίς NUTS') as nuts_name, count(*) as n
    from status_calc
    group by 1
    order by n desc
    limit 15
  )
  select
    (select count(*) from matched),
    (select coalesce(json_agg(json_build_object('status', status, 'count', n)), '[]'::json) from status_agg),
    (select coalesce(json_agg(json_build_object('nuts_name', nuts_name, 'count', n)), '[]'::json) from nuts_agg)
  into v_total, v_status, v_nuts;

  if is_unfiltered then
    select coalesce(json_agg(json_build_object('cpv_code', cpv_code, 'cpv_description', cpv_description, 'count', n)), '[]'::json)
    into v_cpv
    from (select cpv_code, cpv_description, n from public.cpv_notice_counts order by n desc limit 12) t;
  else
    with matched as (
      select p.adam
      from public.procurements_compact p
      where (p_adams is null or p.adam = any(p_adams))
        and (p_query is null or p.adam ilike '%' || p_query || '%' or p.title ilike '%' || p_query || '%')
        and (p_authority is null or p.authority_name ilike '%' || p_authority || '%')
        and (p_year is null or (p.publication_date >= (p_year || '-01-01')::date and p.publication_date <= (p_year || '-12-31')::date))
        and (p_contract_type is null or p.contract_type = p_contract_type)
        and (p_document_type is null or p.document_category = p_document_type)
    )
    select coalesce(json_agg(json_build_object('cpv_code', cpv_code, 'cpv_description', cpv_description, 'count', n)), '[]'::json)
    into v_cpv
    from (
      select rc.cpv_code, min(rc.cpv_description) as cpv_description, count(*) as n
      from public.record_cpvs_compact rc
      join matched m on m.adam = rc.record_adam
      where rc.record_type = 'procurement'
      group by rc.cpv_code
      order by n desc
      limit 12
    ) t;
  end if;

  return json_build_object('total', v_total, 'status', v_status, 'cpv', v_cpv, 'nuts', v_nuts);
end;
$$;
