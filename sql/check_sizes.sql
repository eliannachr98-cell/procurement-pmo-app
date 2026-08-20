select a.adam, a.procurement_adam, a.title as award_title, p.title as notice_title
from public.awards_compact a
join public.record_contractors_compact c
  on c.record_type = 'award' and c.record_adam = a.adam
left join public.procurements_compact p
  on p.adam = a.procurement_adam
where c.contractor_vat = '094007885'
order by a.adam;
