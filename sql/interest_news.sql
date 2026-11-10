-- What is new since a given date for the things a profile follows: used by the
-- Προφίλ ("N νέα από την τελευταία σου επίσκεψη").
--   cpv         = declarations (noticeType 3, category Διακήρυξη) published since,
--                 with one of the followed CPV codes;
--   authorities = the same, from one of the followed authorities;
--   contractors = awards and contracts dated since, won by a followed contractor
--                 (a key is a 9-digit VAT number or part of the name).
create or replace function public.interest_news(
  p_since date,
  p_cpv text[] default null,
  p_authorities text[] default null,
  p_contractors text[] default null
)
returns json
language plpgsql stable as $$
declare
  cpv_new integer := 0;
  authority_new integer := 0;
  contractor_new integer := 0;
begin
  if p_cpv is not null and cardinality(p_cpv) > 0 then
    select count(distinct p.adam) into cpv_new
    from public.procurements_compact p
    join public.procurement_quality_flags f on f.adam = p.adam and f.notice_type_key = '3'
    join public.record_cpvs_compact c on c.record_adam = p.adam and c.record_type = 'procurement'
    where p.publication_date >= p_since and p.document_category = 'declaration'
      and c.cpv_code = any(p_cpv);
  end if;

  if p_authorities is not null and cardinality(p_authorities) > 0 then
    select count(*) into authority_new
    from public.procurements_compact p
    join public.procurement_quality_flags f on f.adam = p.adam and f.notice_type_key = '3'
    where p.publication_date >= p_since and p.document_category = 'declaration'
      and p.authority_name = any(p_authorities);
  end if;

  if p_contractors is not null and cardinality(p_contractors) > 0 then
    select count(*) into contractor_new
    from (
      select a.adam
      from public.awards_compact a
      join public.record_contractors_compact rc on rc.record_adam = a.adam and rc.record_type = 'award'
      where a.award_date >= p_since
        and (rc.contractor_vat = any(p_contractors)
             or exists (select 1 from unnest(p_contractors) k
                        where k !~ '^[0-9]{9}$' and position(upper(k) in upper(rc.contractor_name)) > 0))
      union
      select c.adam
      from public.contracts_compact c
      join public.record_contractors_compact rc on rc.record_adam = c.adam and rc.record_type = 'contract'
      where c.signed_date >= p_since
        and (rc.contractor_vat = any(p_contractors)
             or exists (select 1 from unnest(p_contractors) k
                        where k !~ '^[0-9]{9}$' and position(upper(k) in upper(rc.contractor_name)) > 0))
    ) t;
  end if;

  return json_build_object('cpv', cpv_new, 'authorities', authority_new, 'contractors', contractor_new, 'since', p_since);
end;
$$;
