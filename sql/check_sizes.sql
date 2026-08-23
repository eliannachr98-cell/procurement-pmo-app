select s.adam as tender_adam, 'submitted' as kind, a.adam as award_adam, a.award_date, a.amount_inc_vat
from public.alert_submissions s
join public.awards_compact a on a.procurement_adam = s.adam
where a.cancelled_at is null
union all
select i.adam, 'interested', a.adam, a.award_date, a.amount_inc_vat
from public.alert_interests i
join public.awards_compact a on a.procurement_adam = i.adam
where a.cancelled_at is null;
