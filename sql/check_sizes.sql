select extract(year from publication_date)::int as year, count(*) as procurements
from public.procurements_compact
group by 1
order by 1;
