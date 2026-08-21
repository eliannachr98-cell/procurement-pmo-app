select extname from pg_extension where extname = 'pg_trgm';

select indexname, indexdef
from pg_indexes
where tablename = 'procurements_compact'
  and indexdef ilike '%authority_name%';

select count(distinct authority_name) as distinct_authorities
from public.procurements_compact;
