select to_char(date_trunc('month', publication_date), 'YYYY-MM') as month,
       count(*) filter (where coalesce(budget_inc_vat, budget_ex_vat, budget_unknown_vat, 0) > 2000000000) as excluded_outliers,
       count(*) filter (where coalesce(budget_inc_vat, budget_ex_vat, budget_unknown_vat, 0) between 100000000 and 2000000000) as over_100m
from public.procurements_compact
where document_category = 'declaration'
  and publication_date >= '2025-01-01' and publication_date < '2026-09-01'
group by 1
order by 1;

select adam, publication_date, coalesce(budget_inc_vat, budget_ex_vat, budget_unknown_vat, 0) as budget, contract_type, authority_name
from public.procurements_compact
where document_category = 'declaration'
  and publication_date >= '2026-03-01' and publication_date < '2026-04-01'
order by budget desc
limit 10;

select adam, publication_date, coalesce(budget_inc_vat, budget_ex_vat, budget_unknown_vat, 0) as budget, contract_type, authority_name
from public.procurements_compact
where document_category = 'declaration'
  and publication_date >= '2026-05-01' and publication_date < '2026-06-01'
order by budget desc
limit 10;

select adam, publication_date, coalesce(budget_inc_vat, budget_ex_vat, budget_unknown_vat, 0) as budget, contract_type, authority_name
from public.procurements_compact
where document_category = 'declaration'
  and publication_date >= '2025-11-01' and publication_date < '2025-12-01'
order by budget desc
limit 10;
