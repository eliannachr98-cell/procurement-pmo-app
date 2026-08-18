select relname as table_name,
       pg_size_pretty(pg_total_relation_size(relid)) as total_size,
       pg_total_relation_size(relid) as bytes,
       n_live_tup as approx_rows
from pg_stat_user_tables
order by pg_total_relation_size(relid) desc
limit 40;
