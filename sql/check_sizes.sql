select indexname, indexdef
from pg_indexes
where schemaname = 'public' and tablename in ('record_cpvs_compact', 'record_contractors_compact', 'awards_compact', 'contracts_compact')
order by tablename, indexname;
