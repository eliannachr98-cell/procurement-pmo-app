select relname as table_name,
       n_live_tup,
       n_dead_tup,
       round(100.0 * n_dead_tup / nullif(n_live_tup + n_dead_tup, 0), 1) as dead_pct,
       last_vacuum,
       last_autovacuum
from pg_stat_user_tables
where relname in ('procurements_compact','awards_compact','contracts_compact','record_cpvs_compact','record_contractors_compact')
order by n_dead_tup desc;
