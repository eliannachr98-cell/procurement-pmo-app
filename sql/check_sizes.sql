select a.procurement_adam, a.adam as award_adam, a.award_date, a.amount_inc_vat
from public.awards_compact a
where a.cancelled_at is null
  and a.procurement_adam is not null
  and a.award_date between '2026-01-01' and '2026-12-31'
order by a.award_date desc
limit 3;
