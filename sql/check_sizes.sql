create extension if not exists pg_trgm;

select f.adam as flagged_adam, f.title as flagged_title, f.authority_name, f.budget_inc_vat,
       d.adam as paired_declaration_adam, d.document_category as paired_category,
       similarity(f.title, d.title) as sim,
       (d.adam in (
         '26PROC019659462','26PROC019648814','26PROC019623517','26PROC019629212',
         '26PROC019626927','26PROC019602109','26PROC019561699','26PROC019553627',
         '26PROC019549251','26PROC019525300','26PROC019485543'
       )) as declaration_sent_last_night
from public.procurements_compact f
join public.procurements_compact d
  on d.adam <> f.adam
  and d.document_category = 'declaration'
  and d.authority_name is not distinct from f.authority_name
  and coalesce(d.budget_inc_vat, d.budget_ex_vat, d.budget_unknown_vat, 0)
      = coalesce(f.budget_inc_vat, f.budget_ex_vat, f.budget_unknown_vat, 0)
  and similarity(d.title, f.title) > 0.4
where f.adam in ('26PROC019625263','26PROC019561564','26PROC019518191');
