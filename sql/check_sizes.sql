select adam, title, authority_name, publication_date, budget_ex_vat, budget_inc_vat, budget_unknown_vat, document_category
from public.procurements_compact
where publication_date >= '2026-06-01' and publication_date < '2026-08-01'
  and coalesce(budget_inc_vat, budget_ex_vat, budget_unknown_vat, 0) > 100000000
order by coalesce(budget_inc_vat, budget_ex_vat, budget_unknown_vat, 0) desc
limit 20;
