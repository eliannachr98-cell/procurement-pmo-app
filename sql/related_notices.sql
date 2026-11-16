-- Fast lookup of the "related notices" of a page of the Διαγωνισμοί list: notices of the
-- same authority with the same budget (the budget the list shows: with VAT, else without,
-- else of unknown VAT), published close to the tender: from d_from to d_to, per pair.
-- The list uses them to group a tender with its προκήρυξη / διευκρίνιση / παράταση and to
-- find extensions.
--
-- The old way (authority IN (...) and the budget in any of three columns, over two years)
-- read about 60,000 rows to find 8,000 (12 s); an index on (authority, budget) finds them
-- directly, and a window per tender keeps unrelated tenders of the same authority and
-- budget (repeat purchases) out.
create index if not exists procurements_compact_authority_money_idx on public.procurements_compact
  (authority_name, (coalesce(nullif(budget_inc_vat, 0), nullif(budget_ex_vat, 0), nullif(budget_unknown_vat, 0))), publication_date);

analyze public.procurements_compact;

drop function if exists public.related_notices(jsonb, date, date);
drop function if exists public.related_notices(jsonb);

create or replace function public.related_notices(p_pairs jsonb)
returns json
language sql stable as $$
  select coalesce(json_agg(t), '[]'::json) from (
    select p.adam, p.title, p.authority_name, p.contract_type, p.procedure_type, p.document_category,
           p.nuts_code, p.nuts_name, p.publication_date, p.opening_at,
           p.budget_ex_vat, p.budget_inc_vat, p.budget_unknown_vat, p.status, p.cancelled_at
    from jsonb_to_recordset(p_pairs) as x(authority text, budget numeric, d_from date, d_to date)
    join public.procurements_compact p
      on p.authority_name = x.authority
     and coalesce(nullif(p.budget_inc_vat, 0), nullif(p.budget_ex_vat, 0), nullif(p.budget_unknown_vat, 0)) = x.budget
     and p.publication_date >= x.d_from and p.publication_date <= x.d_to
    limit 1500
  ) t
$$;
