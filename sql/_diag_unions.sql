select 'the adam' as role, adam, document_category, publication_date::text as published, opening_at::text as opening, authority_name, budget_ex_vat::text as ex_vat, budget_inc_vat::text as inc_vat, budget_unknown_vat::text as unknown_vat, left(title, 110) as title, status
from public.procurements_compact where adam = '26PROC020205494'
union all
select 'same authority, close in time', p.adam, p.document_category, p.publication_date::text, p.opening_at::text, p.authority_name, p.budget_ex_vat::text, p.budget_inc_vat::text, p.budget_unknown_vat::text, left(p.title, 110), p.status
from public.procurements_compact p join public.procurements_compact t on t.adam = '26PROC020205494' and p.authority_name = t.authority_name and p.adam <> t.adam
 and p.publication_date between t.publication_date - 120 and t.publication_date + 5
 and (left(p.title, 30) = left(t.title, 30) or p.budget_ex_vat = t.budget_ex_vat or p.budget_inc_vat = t.budget_inc_vat or p.budget_inc_vat = t.budget_ex_vat or p.budget_ex_vat = t.budget_inc_vat)
order by 1 desc, 4
