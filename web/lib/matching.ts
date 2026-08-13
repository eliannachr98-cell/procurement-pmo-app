// Shared Supabase helpers for resolving contractor/CPV text search into
// procurement ADAMs. Used by both /api/procurement and /api/dashboard so
// the two stay consistent about which notices a filter combination matches.

const CHUNK_SIZE = 70;

type AwardRow = {
  adam: string;
  procurement_adam: string | null;
};

type ContractRow = {
  adam: string;
  procurement_adam: string | null;
  award_adam: string | null;
};

type CpvRow = {
  record_type: "procurement" | "award" | "contract";
  record_adam: string;
  cpv_code: string;
  cpv_description: string | null;
};

type ContractorRow = {
  record_type: "award" | "contract";
  record_adam: string;
};

export async function supabaseGet<T>(path: string): Promise<T> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Supabase environment variables are missing");

  const response = await fetch(`${url}/rest/v1/${path}`, {
    headers: { apikey: key },
    cache: "no-store",
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Supabase request failed (${response.status}): ${detail.slice(0, 180)}`);
  }
  return response.json();
}

export async function supabaseRpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Supabase environment variables are missing");

  const response = await fetch(`${url}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { apikey: key, "Content-Type": "application/json" },
    body: JSON.stringify(args),
    cache: "no-store",
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Supabase RPC ${fn} failed (${response.status}): ${detail.slice(0, 180)}`);
  }
  return response.json();
}

export async function relatedRows<T>(table: string, column: string, values: string[], select: string, filter = "") {
  const unique = [...new Set(values.filter(Boolean))];
  const rows: T[] = [];
  for (let index = 0; index < unique.length; index += CHUNK_SIZE) {
    const chunk = unique.slice(index, index + CHUNK_SIZE).map(encodeURIComponent).join(",");
    rows.push(...await supabaseGet<T[]>(
      `${table}?select=${select}${filter ? `&${filter}` : ""}&${column}=in.(${chunk})`,
    ));
  }
  return rows;
}

export async function allRows<T>(path: string) {
  const rows: T[] = [];
  const separator = path.includes("?") ? "&" : "?";
  for (let offset = 0; ; offset += 1000) {
    const page = await supabaseGet<T[]>(`${path}${separator}limit=1000&offset=${offset}`);
    rows.push(...page);
    if (page.length < 1000) return rows;
  }
}

export function intersect(left: string[] | null, right: string[]) {
  if (left === null) return [...new Set(right)];
  const allowed = new Set(right);
  return left.filter((value) => allowed.has(value));
}

export function union(groups: string[][]) {
  return [...new Set(groups.flat())];
}

function contractorSearchTerm(value: string) {
  const aliases: Record<string, string> = {
    PWC: "PRICEWATERHOUSECOOPERS",
    EY: "ERNST",
  };
  return aliases[value.trim().toLocaleUpperCase("en-US")] ?? value;
}

export async function procurementAdamsForContractor(term: string) {
  // A Greek VAT number (ΑΦΜ) is 9 digits and identifies the legal entity
  // precisely - matching on it avoids the name-substring approach missing
  // variants ("Α.Ε." vs "AE", alternate registered names, etc).
  const trimmed = term.trim();
  const filter = /^\d{9}$/.test(trimmed)
    ? `contractor_vat=eq.${encodeURIComponent(trimmed)}`
    : `contractor_name=ilike.${encodeURIComponent(`*${contractorSearchTerm(trimmed)}*`)}`;
  const contractors = await allRows<ContractorRow>(
    `record_contractors_compact?select=record_type,record_adam&${filter}`,
  );
  const awardAdams = contractors.filter((row) => row.record_type === "award").map((row) => row.record_adam);
  const directContractAdams = contractors.filter((row) => row.record_type === "contract").map((row) => row.record_adam);
  const [linkedAwards, linkedContracts, contractsFromAwards] = await Promise.all([
    relatedRows<Pick<AwardRow, "adam" | "procurement_adam">>(
      "awards_compact", "adam", awardAdams, "adam,procurement_adam",
    ),
    relatedRows<Pick<ContractRow, "adam" | "procurement_adam" | "award_adam">>(
      "contracts_compact", "adam", directContractAdams, "adam,procurement_adam,award_adam",
    ),
    // A contractor match on the award also covers the contract it led to,
    // even if that contract's own contractor rows don't repeat the name.
    relatedRows<Pick<ContractRow, "adam" | "procurement_adam" | "award_adam">>(
      "contracts_compact", "award_adam", awardAdams, "adam,procurement_adam,award_adam",
    ),
  ]);
  return {
    procurementAdams: [...new Set([...linkedAwards, ...linkedContracts, ...contractsFromAwards].map((row) => row.procurement_adam).filter((item): item is string => Boolean(item)))],
    awardAdams: [...new Set([...awardAdams, ...linkedContracts.map((row) => row.award_adam)].filter((item): item is string => Boolean(item)))],
    contractAdams: [...new Set([...directContractAdams, ...contractsFromAwards.map((row) => row.adam)])],
  };
}

export async function procurementAdamsForCpv(term: string) {
  const value = encodeURIComponent(`*${term}*`);
  const cpvFilter = /^\d{8}-\d$/.test(term)
    ? `cpv_code=eq.${encodeURIComponent(term)}`
    : `or=(cpv_code.ilike.${value},cpv_description.ilike.${value})`;
  const cpvs = await allRows<CpvRow>(
    `record_cpvs_compact?select=record_type,record_adam,cpv_code,cpv_description&${cpvFilter}`,
  );
  const direct = cpvs.filter((row) => row.record_type === "procurement").map((row) => row.record_adam);
  const awardAdams = cpvs.filter((row) => row.record_type === "award").map((row) => row.record_adam);
  const directContractAdams = cpvs.filter((row) => row.record_type === "contract").map((row) => row.record_adam);
  const [linkedAwards, linkedContracts, contractsFromAwards] = await Promise.all([
    relatedRows<Pick<AwardRow, "adam" | "procurement_adam">>(
      "awards_compact", "adam", awardAdams, "adam,procurement_adam",
    ),
    relatedRows<Pick<ContractRow, "adam" | "procurement_adam" | "award_adam">>(
      "contracts_compact", "adam", directContractAdams, "adam,procurement_adam,award_adam",
    ),
    relatedRows<Pick<ContractRow, "adam" | "procurement_adam" | "award_adam">>(
      "contracts_compact", "award_adam", awardAdams, "adam,procurement_adam,award_adam",
    ),
  ]);
  return {
    procurementAdams: [...new Set([
      ...direct,
      ...linkedAwards.map((row) => row.procurement_adam),
      ...linkedContracts.map((row) => row.procurement_adam),
      ...contractsFromAwards.map((row) => row.procurement_adam),
    ].filter((item): item is string => Boolean(item)))],
    awardAdams: [...new Set([...awardAdams, ...linkedContracts.map((row) => row.award_adam)].filter((item): item is string => Boolean(item)))],
    contractAdams: [...new Set([...directContractAdams, ...contractsFromAwards.map((row) => row.adam)])],
  };
}
