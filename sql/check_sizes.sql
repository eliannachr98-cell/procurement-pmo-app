select contract_type, count(*)
from public.procurements_compact
where document_category = 'declaration'
group by 1
order by 2 desc;
