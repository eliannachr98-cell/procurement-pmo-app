with t as (
  select p.adam, p.publication_date, (p.opening_at at time zone 'Europe/Athens')::date as opening, p.cancelled_at, f.cancelled_api
  from public.procurements_compact p join public.procurement_quality_flags f on f.adam = p.adam
  where f.notice_type_key = '3' and p.document_category = 'declaration' and p.publication_date >= '2025-01-01' and p.publication_date < '2026-01-01'
)
select count(*) as tenders_2025,
       count(*) filter (where opening is null) as no_opening,
       count(*) filter (where opening < publication_date) as opening_before_publication,
       count(*) filter (where opening - publication_date > 365) as opening_over_365_days,
       count(*) filter (where opening < publication_date or opening - publication_date > 365) as the_two_together,
       count(*) filter (where (opening < publication_date or opening - publication_date > 365) and not (cancelled_at is not null or cancelled_api)) as the_two_not_cancelled
from t;
with t as (
  select p.adam, p.publication_date, (p.opening_at at time zone 'Europe/Athens')::date as opening, left(p.title, 50) as title, p.authority_name
  from public.procurements_compact p join public.procurement_quality_flags f on f.adam = p.adam
  where f.notice_type_key = '3' and p.document_category = 'declaration' and p.publication_date >= '2025-01-01' and p.publication_date < '2026-01-01'
)
select adam, publication_date::text as published, opening::text as opening, (opening - publication_date) as days, left(authority_name, 35) as authority
from t where opening < publication_date or opening - publication_date > 365 order by abs(opening - publication_date) desc limit 12
