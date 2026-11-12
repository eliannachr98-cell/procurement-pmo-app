-- One page of the Διαγωνισμοί list for "Η αγορά μου": only the notices of the
-- CPVs (within the regions), authorities and contractors a profile follows,
-- through the same scope_condition as the Επισκόπηση, plus the usual filters.
-- Returns the same columns the list reads from procurements_compact. Ordered by the
-- later submission deadline first (deadlines that look wrong - before publication or
-- over a year after - count as no deadline), then newest publication.
drop function if exists public.list_scoped_procurements(text[], text[], text[], text[], text, text, text, text[], text, text, text[], integer, integer);

create or replace function public.list_scoped_procurements(
  p_scope_cpv text[] default null,
  p_scope_authorities text[] default null,
  p_scope_contractors text[] default null,
  p_scope_nuts text[] default null,
  p_query text default null,
  p_authority text default null,
  p_year text default null,
  p_contract_types text[] default null,
  p_document_type text default null,
  p_hide_direct_procedure text default null,
  p_adams text[] default null,
  p_limit integer default 100,
  p_offset integer default 0,
  p_deadline_from text default null,
  p_deadline_to text default null,
  p_include_invitations boolean default false
)
returns json
language plpgsql stable as $$
declare
  conditions text[] := array[]::text[];
  scope_sql text;
  result json;
begin
  scope_sql := public.scope_condition(p_scope_cpv, p_scope_authorities, p_scope_contractors, p_scope_nuts,
    case when p_include_invitations then array['3', '4', '6'] else array['3'] end);
  if scope_sql is not null then
    conditions := conditions || scope_sql;
  end if;
  if p_adams is not null then
    conditions := conditions || format('p.adam = any(%L::text[])', p_adams);
  end if;
  if p_query is not null and p_query <> '' then
    conditions := conditions || format('(p.adam ilike %L or p.title ilike %L)', '%' || p_query || '%', '%' || p_query || '%');
  end if;
  if p_authority is not null and p_authority <> '' then
    conditions := conditions || format('p.authority_name ilike %L', '%' || p_authority || '%');
  end if;
  if p_year is not null and p_year <> '' then
    conditions := conditions || format('p.publication_date >= %L::date and p.publication_date <= %L::date', p_year || '-01-01', p_year || '-12-31');
  end if;
  if p_contract_types is not null and cardinality(p_contract_types) > 0 then
    conditions := conditions || format('p.contract_type = any(%L::text[])', p_contract_types);
  end if;
  if p_document_type is not null and p_document_type <> '' then
    conditions := conditions || format('p.document_category = %L', p_document_type);
  end if;
  if p_hide_direct_procedure is not null and p_hide_direct_procedure <> '' then
    conditions := conditions || format('p.procedure_type <> %L', p_hide_direct_procedure);
  end if;
  if p_deadline_from is not null and p_deadline_from <> '' then
    conditions := conditions || format('p.opening_at >= %L::date', p_deadline_from);
  end if;
  if p_deadline_to is not null and p_deadline_to <> '' then
    conditions := conditions || format('p.opening_at < (%L::date + 1)', p_deadline_to);
  end if;
  if cardinality(conditions) = 0 then
    conditions := array['true'];
  end if;

  execute format($q$
    select coalesce(json_agg(t), '[]'::json) from (
      select p.adam, p.title, p.authority_name, p.contract_type, p.procedure_type, p.document_category,
             p.nuts_code, p.nuts_name, p.publication_date, p.opening_at,
             p.budget_ex_vat, p.budget_inc_vat, p.budget_unknown_vat, p.status, p.cancelled_at
      from public.procurements_compact p
      where %s
      order by p.publication_date desc nulls last,
               case when p.opening_at is null
                      or (p.opening_at at time zone 'Europe/Athens')::date < p.publication_date
                      or (p.opening_at at time zone 'Europe/Athens')::date - p.publication_date > 365
                    then null else p.opening_at end desc nulls last
      limit %s offset %s
    ) t
  $q$, array_to_string(conditions, ' and '), greatest(p_limit, 1), greatest(p_offset, 0)) into result;
  return result;
end;
$$;
