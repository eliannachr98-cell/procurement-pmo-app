import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function contractorSearchTerm(value: string) {
  const aliases: Record<string, string> = {
    PWC: "PRICEWATERHOUSECOOPERS",
    EY: "ERNST",
  };
  return aliases[value.trim().toLocaleUpperCase("en-US")] ?? value;
}

async function supabaseRows<T>(path: string): Promise<T[]> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Supabase environment variables are missing");
  const response = await fetch(`${url}/rest/v1/${path}`, {
    headers: { apikey: key },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Supabase options request failed (${response.status})`);
  return response.json();
}

async function supabaseRpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Supabase environment variables are missing");
  const response = await fetch(`${url}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { apikey: key, "Content-Type": "application/json" },
    body: JSON.stringify(args),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Supabase RPC ${fn} failed (${response.status})`);
  return response.json();
}

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const type = params.get("type");

    if (type === "year") {
      const rows = await supabaseRpc<{ year: string }[]>("available_years");
      return NextResponse.json({ options: rows.map((row) => row.year) });
    }

    const query = params.get("q")?.trim() ?? "";
    if (query.length < 2) return NextResponse.json({ options: [] });
    const value = encodeURIComponent(`*${query}*`);

    if (type === "contractor") {
      const brand = query.toLocaleUpperCase("en-US");
      const brands: Record<string, { value: string; label: string }> = {
        PWC: { value: "PWC", label: "PWC — όλες οι επωνυμίες PricewaterhouseCoopers" },
        EY: { value: "EY", label: "EY — όλες οι επωνυμίες Ernst & Young" },
        OCTANE: { value: "OCTANE", label: "OCTANE — όλες οι επωνυμίες" },
      };
      if (brands[brand]) return NextResponse.json({ options: [brands[brand]] });
      const contractorValue = encodeURIComponent(`*${contractorSearchTerm(query)}*`);
      const rows = await supabaseRows<{ contractor_name: string; contractor_vat: string | null }>(
        `record_contractors_compact?select=contractor_name,contractor_vat&contractor_name=ilike.${contractorValue}&limit=200`,
      );
      // The same company is typed many different ways across notices, so
      // group by VAT (the stable identifier) and merge groups that share an
      // exact name string across a mistyped VAT, same as the market table.
      type Group = { key: string; names: Map<string, number> };
      const groups = new Map<string, Group>();
      const groupKeyFor = (row: { contractor_name: string; contractor_vat: string | null }) => row.contractor_vat?.trim() || row.contractor_name;
      for (const row of rows) {
        if (!row.contractor_name) continue;
        const key = groupKeyFor(row);
        let group = groups.get(key);
        if (!group) { group = { key, names: new Map() }; groups.set(key, group); }
        group.names.set(row.contractor_name, (group.names.get(row.contractor_name) ?? 0) + 1);
      }
      const parent = new Map<string, string>();
      const find = (key: string): string => {
        let root = key;
        while (parent.has(root) && parent.get(root) !== root) root = parent.get(root)!;
        return root;
      };
      for (const key of groups.keys()) parent.set(key, key);
      const nameOwner = new Map<string, string>();
      for (const [key, group] of groups) {
        for (const name of group.names.keys()) {
          const owner = nameOwner.get(name);
          if (!owner) { nameOwner.set(name, key); continue; }
          const rootA = find(owner);
          const rootB = find(key);
          if (rootA !== rootB) parent.set(rootB, rootA);
        }
      }
      const merged = new Map<string, Map<string, number>>();
      for (const [key, group] of groups) {
        const root = find(key);
        let names = merged.get(root);
        if (!names) { names = new Map(); merged.set(root, names); }
        for (const [name, count] of group.names) names.set(name, (names.get(name) ?? 0) + count);
      }
      const options = [...merged.entries()]
        .map(([key, names]) => {
          const sorted = [...names.entries()].sort((a, b) => b[1] - a[1]);
          const canonicalName = sorted[0][0];
          const isVat = /^\d{9}$/.test(key);
          return { value: isVat ? key : canonicalName, label: canonicalName, total: sorted.reduce((sum, [, count]) => sum + count, 0) };
        })
        .sort((a, b) => b.total - a.total)
        .slice(0, 20)
        .map(({ value, label }) => ({ value, label }));
      return NextResponse.json({ options });
    }

    if (type === "authority") {
      // A real DISTINCT at the database level (search_authorities), not a
      // sample of raw rows deduped client-side - a short/broad term used to
      // silently miss real matches when the sample happened to be dominated
      // by a few high-volume authorities.
      const rows = await supabaseRpc<{ authority_name: string }[]>("search_authorities", { p_query: query });
      return NextResponse.json({ options: rows.map((row) => ({ value: row.authority_name, label: row.authority_name })) });
    }

    if (type === "cpv") {
      const filter = /^\d{2,8}(-\d)?$/.test(query)
        ? `cpv_code=ilike.${encodeURIComponent(`${query}*`)}`
        : `cpv_description=ilike.${value}`;
      const rows = await supabaseRows<{ cpv_code: string; cpv_description: string | null }>(
        `record_cpvs_compact?select=cpv_code,cpv_description&${filter}&limit=80`,
      );
      const unique = new Map(rows.map((row) => [row.cpv_code, { value: row.cpv_code, label: `${row.cpv_code} — ${row.cpv_description || "Χωρίς περιγραφή"}` }]));
      return NextResponse.json({ options: [...unique.values()].sort((a, b) => a.value.localeCompare(b.value)).slice(0, 20) });
    }

    return NextResponse.json({ options: [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown options error";
    return NextResponse.json({ error: message, options: [] }, { status: 500 });
  }
}
