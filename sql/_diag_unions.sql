select count(*) as awards_1_to_7_jan_2024 from public.awards_compact where award_date >= '2024-01-01' and award_date < '2024-01-08';
select count(*) as awards_in_2024 from public.awards_compact where award_date >= '2024-01-01' and award_date < '2025-01-01'
