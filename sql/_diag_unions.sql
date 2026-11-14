with t as (select adam, title, authority_name, publication_date, opening_at, coalesce(nullif(budget_inc_vat,0), nullif(budget_ex_vat,0), nullif(budget_unknown_vat,0)) as budget from public.procurements_compact where adam = '26PROC019954956')
select 'tender' as role, t.adam, 'declaration' as category, t.publication_date::text as published, t.opening_at::text as opening, left(t.title, 90) as title, t.budget::text as budget from t
union all
select 'related', r.adam, r.document_category, r.publication_date::text, r.opening_at::text, left(r.title, 90), coalesce(nullif(r.budget_inc_vat,0), nullif(r.budget_ex_vat,0), nullif(r.budget_unknown_vat,0))::text
from t join public.procurements_compact r on r.authority_name = t.authority_name and r.adam <> t.adam and r.publication_date >= t.publication_date
 and (r.budget_inc_vat = t.budget or r.budget_ex_vat = t.budget or r.budget_unknown_vat = t.budget)
order by 1 desc, 4
