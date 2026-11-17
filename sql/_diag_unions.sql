with rep as (
  select d.adam as new_adam, d.publication_date as new_pub, d.opening_at as new_open, e.adam as old_adam, e.publication_date as old_pub, e.opening_at as old_open, d.authority_name, left(d.title, 50) as title
  from public.procurements_compact d
  join public.procurements_compact e on e.authority_name = d.authority_name and e.adam <> d.adam
   and e.document_category = 'declaration' and d.document_category = 'declaration'
   and e.budget_ex_vat = d.budget_ex_vat and d.budget_ex_vat > 0
   and left(e.title, 40) = left(d.title, 40)
   and e.publication_date < d.publication_date and e.publication_date >= d.publication_date - 120
   and e.opening_at >= d.publication_date - 3 and d.opening_at > e.opening_at
   and d.opening_at - e.opening_at <= interval '180 days'
  where d.publication_date >= current_date - 365
)
select count(*) as republications_last_year, count(distinct new_adam) as distinct_new from rep;
with rep as (
  select d.adam as new_adam, d.publication_date as new_pub, d.opening_at::date as new_open, e.adam as old_adam, e.opening_at::date as old_open, left(d.authority_name, 40) as authority, left(d.title, 40) as title
  from public.procurements_compact d
  join public.procurements_compact e on e.authority_name = d.authority_name and e.adam <> d.adam
   and e.document_category = 'declaration' and d.document_category = 'declaration'
   and e.budget_ex_vat = d.budget_ex_vat and d.budget_ex_vat > 0 and left(e.title, 40) = left(d.title, 40)
   and e.publication_date < d.publication_date and e.publication_date >= d.publication_date - 120
   and e.opening_at >= d.publication_date - 3 and d.opening_at > e.opening_at and d.opening_at - e.opening_at <= interval '180 days'
  where d.publication_date >= current_date - 60
)
select * from rep order by new_pub desc limit 8
