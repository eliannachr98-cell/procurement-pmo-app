select to_char(publication_date, 'YYYY-MM') as month, document_category, count(*)
from public.procurements_compact
where publication_date >= '2025-01-01' and publication_date < '2026-01-01'
  and document_category = 'invitation'
group by 1, 2
order by 1;
