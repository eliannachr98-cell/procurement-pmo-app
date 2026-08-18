select 'award' as source, to_char(award_date, 'YYYY-MM') as month, count(*) as rows
from public.awards_compact
where award_date >= '2025-01-01' and award_date < '2026-01-01'
group by 1, 2
union all
select 'contract' as source, to_char(signed_date, 'YYYY-MM') as month, count(*) as rows
from public.contracts_compact
where signed_date >= '2025-01-01' and signed_date < '2026-01-01'
group by 1, 2
order by 1, 2;
