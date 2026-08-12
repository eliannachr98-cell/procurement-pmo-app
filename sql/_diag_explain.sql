explain (analyze, buffers, format text)
with matched as (
  select p.adam, p.opening_at, p.cancelled_at, p.status as raw_status,
         p.nuts_name, p.nuts_code
  from public.procurements_compact p
  where true
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
  select rc.cpv_code, min(rc.cpv_description) as cpv_description,
         count(*) as n
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
);
