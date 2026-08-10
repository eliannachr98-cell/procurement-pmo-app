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

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const type = params.get("type");
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
      const rows = await supabaseRows<{ contractor_name: string }>(
        `record_contractors_compact?select=contractor_name&contractor_name=ilike.${contractorValue}&limit=60`,
      );
      return NextResponse.json({ options: [...new Set(rows.map((row) => row.contractor_name).filter(Boolean))].sort((a, b) => a.localeCompare(b, "el")).slice(0, 20) });
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
