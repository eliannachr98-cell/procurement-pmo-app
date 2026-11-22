select 'database total' as what, pg_size_pretty(pg_database_size(current_database())) as size, pg_database_size(current_database()) as bytes
union all
select relname, pg_size_pretty(pg_total_relation_size(c.oid)), pg_total_relation_size(c.oid)
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and pg_total_relation_size(c.oid) > 20000000
order by 3 desc limit 14;
select 'awards by award year' as what, extract(year from award_date)::text as year, count(*) as n from public.awards_compact group by 2 order by 2 limit 10;
select 'contracts by signed year' as what, extract(year from signed_date)::text as year, count(*) as n from public.contracts_compact group by 2 order by 2 limit 10
