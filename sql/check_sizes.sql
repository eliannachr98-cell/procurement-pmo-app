select nuts_code, nuts_name, count(*)
from public.procurements_compact
where nuts_name ilike '%αττικ%' or nuts_code ilike 'EL3%'
group by nuts_code, nuts_name
order by count(*) desc
limit 20;
