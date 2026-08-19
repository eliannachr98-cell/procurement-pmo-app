import { NextResponse } from "next/server";
import {
  intersect,
  procurementAdamsForContractor,
  procurementAdamsForCpv,
  supabaseRpc,
  union,
} from "@/lib/matching";

export const dynamic = "force-dynamic";

type Breakdown = {
  total: number;
  status: { status: string; count: number; budget: number }[];
  cpv: { cpv_code: string; cpv_description: string | null; count: number }[];
  cpvTotal: number;
  nuts: { nuts_code: string; nuts_name: string; count: number }[];
  monthly: { month: string; count: number; budget: number; authorities: number; cpv: number }[];
};

export async function GET(request: Request) {
  try {
    const searchParams = new URL(request.url).searchParams;
    // Τύπος εγγράφου/σύμβασης deliberately don't narrow this view - passing
    // either one to dashboard_breakdown skips the cached fast path and forces
    // the live query, which reliably blows past PostgREST's own timeout
    // regardless of how selective the value is (confirmed even "Έργα", one
    // of the smallest categories, times out the same as the broadest one -
    // an index, ANALYZE, and consolidating the repeated CPV join all made no
    // difference, so the ceiling isn't query cost). Only these four narrow
    // what the dashboard shows.
    const authority = searchParams.get("authority")?.trim() ?? "";
    const contractors = searchParams.getAll("contractor").flatMap((value) => value.split(",")).map((value) => value.trim()).filter(Boolean);
    const cpvs = searchParams.getAll("cpv").flatMap((value) => value.split(",")).map((value) => value.trim()).filter(Boolean);
    const year = searchParams.get("year")?.trim() ?? "";

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

    if (matchingAdams?.length === 0) {
      return NextResponse.json({ total: 0, status: [], cpv: [], cpvTotal: 0, nuts: [], monthly: [] } satisfies Breakdown);
    }

    const breakdown = await supabaseRpc<Breakdown>("dashboard_breakdown", {
      p_query: null,
      p_authority: authority || null,
      p_year: /^\d{4}$/.test(year) ? year : null,
      p_contract_type: null,
      p_document_type: null,
      p_adams: matchingAdams,
    });

    return NextResponse.json(breakdown, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown dashboard error";
    console.error(`[dashboard-api] ${message}`);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
