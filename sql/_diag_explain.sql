explain (analyze, buffers, format text, timing true)
with matched as (
  select p.adam, p.opening_at, p.cancelled_at, p.status as raw_status,
         p.nuts_name, p.nuts_code
  from public.procurements_compact p
  where p.authority_name ilike '%ΔΗΜΟΣ ΑΘΗΝΑΙΩΝ%'
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
)
select (select count(*) from matched), (select coalesce(json_agg(json_build_object('status', status, 'count', n)), '[]'::json) from status_agg);
