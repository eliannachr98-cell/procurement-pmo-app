import { NextResponse } from "next/server";
import { supabaseRpc } from "@/lib/matching";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Figures for the Ανταγωνισμός block: only the contractors passed in (the ones
// the profile follows), over the whole market, optionally one year. Computed in
// SQL (competitor_overview) from the ready-made market_*_facts tables.
export async function GET(request: Request) {
  try {
    const searchParams = new URL(request.url).searchParams;
    const keys = searchParams.getAll("key").flatMap((value) => value.split("|")).map((value) => value.trim()).filter(Boolean).slice(0, 30);
    const year = searchParams.get("year")?.trim() ?? "";
    if (!keys.length) return NextResponse.json({ competitors: [], common: [] });
    const result = await supabaseRpc<unknown>("competitor_overview", {
      p_keys: keys,
      p_year: /^\d{4}$/.test(year) ? year : null,
    });
    // The per-document list (items) is not shown here (it is for a separate page), so it is not sent.
    (result as { competitors?: { items?: unknown }[] }).competitors?.forEach((entry) => { delete entry.items; });
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown competitors error";
    console.error(`[competitors-api] ${message}`);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
