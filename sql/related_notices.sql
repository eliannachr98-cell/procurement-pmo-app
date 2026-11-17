-- Fast lookup of the "related notices" of a page of the Διαγωνισμοί list: notices of the
-- same authority published close to the tender (d_from to d_to, per pair) that have the same
-- budget - the budget the list shows (with VAT, else without, else of unknown VAT) OR the
-- budget without VAT. A tender re-published with another VAT rate has a different amount
-- with VAT but the same amount without VAT, so both are compared.
-- The list uses them to group a tender with its προκήρυξη / διευκρίνιση / παράταση / the
-- previous publication, and to find extensions.
create index if not exists procurements_compact_authority_money_idx on public.procurements_compact
  (authority_name, (coalesce(nullif(budget_inc_vat, 0), nullif(budget_ex_vat, 0), nullif(budget_unknown_vat, 0))), publication_date);
create index if not exists procurements_compact_authority_exvat_idx on public.procurements_compact
  (authority_name, budget_ex_vat, publication_date);

analyze public.procurements_compact;

drop function if exists public.related_notices(jsonb, date, date);
drop function if exists public.related_notices(jsonb);

create or replace function public.related_notices(p_pairs jsonb)
returns json
language sql stable as $$
  select coalesce(json_agg(t), '[]'::json) from (
    select * from (
      select p.adam, p.title, p.authority_name, p.contract_type, p.procedure_type, p.document_category,
             p.nuts_code, p.nuts_name, p.publication_date, p.opening_at,
             p.budget_ex_vat, p.budget_inc_vat, p.budget_unknown_vat, p.status, p.cancelled_at
      from jsonb_to_recordset(p_pairs) as x(authority text, budget numeric, budget_ex numeric, d_from date, d_to date)
      join public.procurements_compact p
        on p.authority_name = x.authority
       and coalesce(nullif(p.budget_inc_vat, 0), nullif(p.budget_ex_vat, 0), nullif(p.budget_unknown_vat, 0)) = x.budget
       and p.publication_date >= x.d_from and p.publication_date <= x.d_to
      union
      select p.adam, p.title, p.authority_name, p.contract_type, p.procedure_type, p.document_category,
             p.nuts_code, p.nuts_name, p.publication_date, p.opening_at,
             p.budget_ex_vat, p.budget_inc_vat, p.budget_unknown_vat, p.status, p.cancelled_at
      from jsonb_to_recordset(p_pairs) as x(authority text, budget numeric, budget_ex numeric, d_from date, d_to date)
      join public.procurements_compact p
        on p.authority_name = x.authority and x.budget_ex is not null and p.budget_ex_vat = x.budget_ex
       and p.publication_date >= x.d_from and p.publication_date <= x.d_to
    ) u
    limit 1500
  ) t
$$;
