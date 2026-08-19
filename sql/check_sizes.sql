select indexname, indexdef
from pg_indexes
where schemaname = 'public' and tablename = 'procurements_compact'
order by indexname;
