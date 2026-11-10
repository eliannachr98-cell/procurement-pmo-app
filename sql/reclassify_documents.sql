-- Re-derives procurements_compact.document_category with the same rules as
-- compact_transform.classify_document (the thesis Excel title keywords, accents
-- and case ignored, first match wins), so notices loaded before the keyword
-- list changed follow the same rules as new ones. Only rows whose category
-- changes are updated.
create or replace function public.reclassify_document_categories()
returns integer
language plpgsql as $$
declare
  affected integer;
begin
  update public.procurements_compact p
  set document_category = t.new_category
  from (
    select p2.adam,
           case
             when s ~ 'ΤΡΟΠΟΠ|ΔΙΟΡΘΩ' then 'amendment'
             when s ~ 'ΠΑΡΑΤΑΣ|ΜΕΤΑΘΕΣ' then 'extension'
             when s ~ 'ΔΙΕΥΚΡ' then 'clarification'
             when s ~ 'ΠΕΡΙΛΗΨ' then 'summary'
             when s ~ 'ΑΠΟΦΑΣ|ΜΑΤΑΙΩ|ΑΝΑΡΤΗΣ|ΠΡΟΣΦΥΓ|ΑΕΠΠ' then 'decision'
             when g.notice_type_key = '2' then 'announcement'
             else 'declaration'
           end as new_category
    from public.procurements_compact p2
    cross join lateral (select translate(upper(coalesce(p2.title, '')), 'ΆΈΉΊΌΎΏΪΫ', 'ΑΕΗΙΟΥΩΙΥ') as s) x
    left join public.procurement_quality_flags g on g.adam = p2.adam
  ) t
  where p.adam = t.adam and p.document_category is distinct from t.new_category
    and (t.new_category in ('amendment', 'extension', 'clarification', 'summary', 'decision')
         or p.document_category in ('amendment', 'extension', 'clarification', 'summary', 'decision'));
  get diagnostics affected = row_count;
  return affected;
end;
$$;
