select a.adam, a.procurement_adam, a.award_date, a.amount_inc_vat,
  (select string_agg(rc.contractor_name, ', ' order by rc.position)
   from public.record_contractors_compact rc
   where rc.record_adam = a.adam and rc.record_type = 'award') as contractors
from public.awards_compact a
where a.cancelled_at is null
order by a.award_date desc nulls last
limit 5;
