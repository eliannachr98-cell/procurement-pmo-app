select extract(year from p.publication_date)::int as year,
       count(*) filter (where f.notice_type_key = '3') as type3_all,
       count(*) filter (where f.notice_type_key = '3' and p.document_category = 'declaration') as type3_declaration_cat,
       count(*) filter (where f.in_stats) as in_stats,
       count(*) filter (where f.notice_type_key = '3' and p.cancelled_at is not null) as cancelled_at,
       count(*) filter (where f.notice_type_key = '3' and p.status = 'cancelled') as status_cancelled,
       count(*) filter (where f.notice_type_key = '3' and f.cancelled_api) as cancelled_api,
       count(*) filter (where f.notice_type_key = '3' and (p.cancelled_at is not null or p.status = 'cancelled' or f.cancelled_api)) as cancelled_any,
       count(*) filter (where f.notice_type_key = '3' and f.has_award_ref) as has_award_ref
from public.procurements_compact p join public.procurement_quality_flags f on f.adam = p.adam
where p.publication_date is not null group by 1 order by 1
