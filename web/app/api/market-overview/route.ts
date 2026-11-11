import { NextResponse } from "next/server";
import {
  intersect,
  procurementAdamsForContractor,
  procurementAdamsForCpv,
  supabaseGet,
  supabaseRpc,
  union,
} from "@/lib/matching";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Summary for the Overview's "Αγορά" and "Ανταγωνισμός" blocks - computed in
// SQL (market_overview) from the awards/contracts linked to the notices the
// current filters select.
export async function GET(request: Request) {
  try {
    const searchParams = new URL(request.url).searchParams;
    const list = (name: string) => searchParams.getAll(name).flatMap((value) => value.split(",")).map((value) => value.trim()).filter(Boolean);
    const authority = searchParams.get("authority")?.trim() ?? "";
    const year = searchParams.get("year")?.trim() ?? "";
    const contractors = list("contractor");
    const cpvs = list("cpv");
    const contractTypes = list("contractType");

    let matchingAdams: string[] | null = null;
    if (contractors.length) {
      const groups: Awaited<ReturnType<typeof procurementAdamsForContractor>>[] = [];
      for (const item of contractors) groups.push(await procurementAdamsForContractor(item));
      matchingAdams = intersect(matchingAdams, union(groups.map((item) => item.procurementAdams)));
    }
    if (cpvs.length) {
      const groups: Awaited<ReturnType<typeof procurementAdamsForCpv>>[] = [];
      for (const item of cpvs) groups.push(await procurementAdamsForCpv(item));
      matchingAdams = intersect(matchingAdams, union(groups.map((item) => item.procurementAdams)));
    }
    const watchCpvs = list("watchCpv");
    const watchAuthorities = list("watchAuthority");
    const watchContractors = list("watchContractor");
    const watchNuts = list("watchNuts");
    const track = list("track");
    if (matchingAdams?.length === 0) return NextResponse.json({ empty: true });

    // A year (or no filter at all) on its own is far too heavy to compute per
    // request, so it's precomputed into market_overview_cache (see
    // sql/market_overview.sql); anything narrower is computed live.
    const cacheOnly = !authority && !contractors.length && !cpvs.length && !watchCpvs.length && !watchAuthorities.length && !watchContractors.length && !track.length && !contractTypes.length;
    if (cacheOnly) {
      const key = /^\d{4}$/.test(year) ? year : "all";
      const rows = await supabaseGet<{ payload: unknown }[]>(`market_overview_cache?select=payload&cache_key=eq.${key}`);
      if (!rows.length) return NextResponse.json({ error: "not precomputed" }, { status: 404 });
      return NextResponse.json(rows[0].payload, { headers: { "Cache-Control": "no-store, max-age=0" } });
    }

    const summary = await supabaseRpc<unknown>("market_overview", {
      p_year: /^\d{4}$/.test(year) ? year : null,
      p_authority: authority && authority !== "Όλες" ? authority : null,
      p_contract_type: contractTypes.length ? contractTypes : null,
      p_adams: matchingAdams,
      p_scope_cpv: watchCpvs.length ? watchCpvs : null,
      p_scope_authorities: watchAuthorities.length ? watchAuthorities : null,
      p_scope_contractors: watchContractors.length ? watchContractors : null,
      p_scope_nuts: watchNuts.length ? watchNuts : null,
      p_stats_only: true,
      p_track: track.length ? track : null,
    });
    return NextResponse.json(summary, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown market overview error";
    console.error(`[market-overview-api] ${message}`);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
