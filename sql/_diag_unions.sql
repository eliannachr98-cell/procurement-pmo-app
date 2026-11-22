with t as (
  select p.adam, extract(year from p.publication_date)::int as year,
         (case when p.cancelled_at is not null then 1 else 0 end) as c1, (case when f.cancelled_api then 1 else 0 end) as c2,
         (case when exists (select 1 from public.awards_compact a where a.procurement_adam = p.adam) then 1 else 0 end) as w,
         (case when p.document_category = 'declaration' then 'd' else 'o' end) as cat
  from public.procurements_compact p join public.procurement_quality_flags f on f.adam = p.adam
  where f.notice_type_key = '3' and p.publication_date >= '2024-01-01' and p.publication_date < '2026-01-01'
), n as (select t.*, (row_number() over (partition by year order by adam) - 1) / 1500 as chunk from t)
select year, chunk, count(*) as n, string_agg(adam || '|' || c1 || c2 || w || cat, ',' order by adam) as lst from n group by year, chunk order by year, chunk
