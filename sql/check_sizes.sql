select to_char(publication_date, 'YYYY-MM') as month, count(*) as procurements
from public.procurements_compact
where publication_date >= '2026-01-01' and publication_date < '2027-01-01'
group by 1
order by 1;
