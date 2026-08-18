select relname as table_name,
       pg_size_pretty(pg_total_relation_size(relid)) as total_size,
       pg_total_relation_size(relid) as bytes,
       pg_size_pretty(pg_relation_size(relid)) as table_only,
       pg_size_pretty(pg_total_relation_size(relid) - pg_relation_size(relid)) as indexes_toast,
       n_live_tup as approx_rows
from pg_catalog.pg_statio_user_tables
join pg_stat_user_tables using (relid)
order by pg_total_relation_size(relid) desc
limit 40;
