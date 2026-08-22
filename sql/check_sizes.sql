with watched as (
  select cpv_code from public.cpv_watchlist
),
candidates as (
  select distinct p.adam, p.title, p.authority_name, p.publication_date, p.document_category,
         coalesce(p.budget_inc_vat, p.budget_ex_vat, p.budget_unknown_vat, 0) as budget,
         regexp_replace(trim(p.title), '\s*\([^)]*\)\s*$', '') as norm_title
  from public.procurements_compact p
  join public.record_cpvs_compact rc on rc.record_adam = p.adam and rc.record_type = 'procurement'
  join watched w on w.cpv_code = rc.cpv_code
  where p.document_category in ('declaration', 'announcement')
    and p.publication_date >= current_date - interval '365 days'
),
grouped as (
  select authority_name, budget, norm_title,
         count(*) as n,
         max(publication_date) - min(publication_date) as span_days,
         count(distinct document_category) as distinct_categories,
         array_agg(adam order by publication_date) as adams,
         array_agg(document_category order by publication_date) as categories,
         array_agg(publication_date order by publication_date) as dates
  from candidates
  group by authority_name, budget, norm_title
)
select n, span_days, authority_name, norm_title, adams, categories, dates
from grouped
where n > 1
  and span_days <= 30
  and distinct_categories > 1
order by n desc, authority_name
limit 25;

with watched as (
  select cpv_code from public.cpv_watchlist
),
candidates as (
  select distinct p.adam, p.title, p.authority_name, p.publication_date, p.document_category,
         coalesce(p.budget_inc_vat, p.budget_ex_vat, p.budget_unknown_vat, 0) as budget,
         regexp_replace(trim(p.title), '\s*\([^)]*\)\s*$', '') as norm_title
  from public.procurements_compact p
  join public.record_cpvs_compact rc on rc.record_adam = p.adam and rc.record_type = 'procurement'
  join watched w on w.cpv_code = rc.cpv_code
  where p.document_category in ('declaration', 'announcement')
    and p.publication_date >= current_date - interval '365 days'
),
grouped as (
  select authority_name, budget, norm_title,
         count(*) as n,
         max(publication_date) - min(publication_date) as span_days,
         count(distinct document_category) as distinct_categories
  from candidates
  group by authority_name, budget, norm_title
)
select
  (select count(*) from candidates) as total_candidates,
  (select count(*) from grouped where n > 1) as raw_groups_before_filters,
  (select count(*) from grouped where n > 1 and span_days <= 30 and distinct_categories > 1) as clean_groups,
  (select coalesce(sum(n), 0) from grouped where n > 1 and span_days <= 30 and distinct_categories > 1) as notices_in_clean_groups;
