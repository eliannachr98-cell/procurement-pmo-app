-- Builds the SQL condition (alias p = procurements_compact) for "the notices of
-- the things a profile follows": declarations (noticeType 3) with one of the
-- followed CPV codes, OR from one of the followed authorities, OR that a
-- followed contractor took part in (an award or contract).
-- The ADAMs are first collected inside the database (each part uses its own
-- index) and then embedded as a literal array, which is what keeps the plans of
-- dashboard_breakdown and market_overview fast. A condition made of OR-ed
-- subqueries was far slower (minutes).
-- p_types: notice types kept in the CPV part (default only 3 = Διακήρυξη; the list adds
-- 4 and 6 = Προσκλήσεις). p_nuts (region code prefixes, e.g. EL3) narrows the CPV part to those regions.
-- A contractor key is a 9-digit VAT number or part of the name.
drop function if exists public.scope_condition(text[], text[], text[]);
drop function if exists public.scope_condition(text[], text[], text[], text[]);

create or replace function public.scope_condition(
  p_cpv text[] default null,
  p_authorities text[] default null,
  p_contractors text[] default null,
  p_nuts text[] default null,
  p_types text[] default array['3']
)
returns text
language plpgsql stable as $$
declare
  adams text[] := array[]::text[];
  part text[];
  rc_parts text[] := array[]::text[];
  vats text[];
  k text;
  rc_cond text;
  any_scope boolean := false;
begin
  if p_cpv is not null and cardinality(p_cpv) > 0 then
    any_scope := true;
    select coalesce(array_agg(distinct c.record_adam), array[]::text[]) into part
    from public.record_cpvs_compact c
    join public.procurement_quality_flags f on f.adam = c.record_adam and f.notice_type_key = any(p_types)
    join public.procurements_compact pn on pn.adam = c.record_adam
    where c.record_type = 'procurement' and c.cpv_code = any(p_cpv)
      and (p_nuts is null or cardinality(p_nuts) = 0
           or exists (select 1 from unnest(p_nuts) np where pn.nuts_code like np || '%'));
    adams := adams || part;
  end if;

  if p_authorities is not null and cardinality(p_authorities) > 0 then
    any_scope := true;
    select coalesce(array_agg(p.adam), array[]::text[]) into part
    from public.procurements_compact p
    where p.authority_name = any(p_authorities) and p.document_category = 'declaration';
    adams := adams || part;
  end if;

  if p_contractors is not null and cardinality(p_contractors) > 0 then
    any_scope := true;
    select coalesce(array_agg(x) filter (where x ~ '^[0-9]{9}$'), array[]::text[]) into vats from unnest(p_contractors) x;
    if cardinality(vats) > 0 then
      rc_parts := rc_parts || format('rc.contractor_vat = any(%L::text[])', vats);
    end if;
    foreach k in array p_contractors loop
      if k !~ '^[0-9]{9}$' then
        rc_parts := rc_parts || format('rc.contractor_name ilike %L', '%' || k || '%');
      end if;
    end loop;
    rc_cond := array_to_string(rc_parts, ' or ');
    execute format($f$
      select coalesce(array_agg(distinct x), array[]::text[]) from (
        select a.procurement_adam as x from public.awards_compact a
          join public.record_contractors_compact rc on rc.record_adam = a.adam and rc.record_type = 'award' where %1$s
        union
        select c.procurement_adam from public.contracts_compact c
          join public.record_contractors_compact rc on rc.record_adam = c.adam and rc.record_type = 'contract' where %1$s
        union
        select c.procurement_adam from public.contracts_compact c
          join public.awards_compact a on a.adam = c.award_adam
          join public.record_contractors_compact rc on rc.record_adam = a.adam and rc.record_type = 'award' where %1$s
      ) t where x is not null
    $f$, rc_cond) into part;
    adams := adams || part;
  end if;

  if not any_scope then
    return null;
  end if;
  return format('p.adam = any(%L::text[])', adams);
end;
$$;
