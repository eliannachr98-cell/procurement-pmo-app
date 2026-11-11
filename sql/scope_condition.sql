-- Builds the SQL condition (alias p = procurements_compact) for "the notices of
-- the things a profile follows": notices with one of the followed CPV codes, OR
-- from one of the followed authorities, OR that a followed contractor took part
-- in (an award or contract). Used by dashboard_breakdown and market_overview so
-- the whole resolution happens inside the database in one query, instead of the
-- API collecting thousands of ADAMs through many round trips.
-- A contractor key is a 9-digit VAT number or part of the name.
create or replace function public.scope_condition(
  p_cpv text[] default null,
  p_authorities text[] default null,
  p_contractors text[] default null
)
returns text
language plpgsql stable as $$
declare
  parts text[] := array[]::text[];
  rc_parts text[] := array[]::text[];
  vats text[];
  k text;
  rc_cond text;
begin
  if p_cpv is not null and cardinality(p_cpv) > 0 then
    parts := parts || format(
      'p.adam in (select c.record_adam from public.record_cpvs_compact c where c.record_type = ''procurement'' and c.cpv_code = any(%L::text[]))',
      p_cpv);
  end if;

  if p_authorities is not null and cardinality(p_authorities) > 0 then
    parts := parts || format('p.authority_name = any(%L::text[])', p_authorities);
  end if;

  if p_contractors is not null and cardinality(p_contractors) > 0 then
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
    parts := parts || format($f$p.adam in (
        select a.procurement_adam from public.awards_compact a
          join public.record_contractors_compact rc on rc.record_adam = a.adam and rc.record_type = 'award' where %1$s
        union
        select c.procurement_adam from public.contracts_compact c
          join public.record_contractors_compact rc on rc.record_adam = c.adam and rc.record_type = 'contract' where %1$s
        union
        select c.procurement_adam from public.contracts_compact c
          join public.awards_compact a on a.adam = c.award_adam
          join public.record_contractors_compact rc on rc.record_adam = a.adam and rc.record_type = 'award' where %1$s
      )$f$, rc_cond);
  end if;

  if cardinality(parts) = 0 then
    return null;
  end if;
  return '(' || array_to_string(parts, ' or ') || ')';
end;
$$;
