select 'notice' as source, count(*) from public.procurements_compact where publication_date = '2025-08-05'
union all
select 'award' as source, count(*) from public.awards_compact where award_date = '2025-08-05'
union all
select 'contract' as source, count(*) from public.contracts_compact where signed_date = '2025-08-05';
