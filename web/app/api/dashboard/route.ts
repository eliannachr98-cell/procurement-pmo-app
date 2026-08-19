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
    const authority = searchParams.get("authority")?.trim() ?? "";
    const contractors = searchParams.getAll("contractor").flatMap((value) => value.split(",")).map((value) => value.trim()).filter(Boolean);
    const cpvs = searchParams.getAll("cpv").flatMap((value) => value.split(",")).map((value) => value.trim()).filter(Boolean);
    const year = searchParams.get("year")?.trim() ?? "";
    // Only a single Τύπος σύμβασης value with nothing else active is
    // precomputed into dashboard_cache by refresh_dashboard_caches() - any
    // other combination would hit the live query path, which reliably blows
    // past PostgREST's own timeout regardless of how selective the value is
    // (confirmed even "Έργα", one of the smallest categories, times out the
    // same as the broadest one). The client only sends it in that exact
    // shape; this is just a second guard against calling it otherwise.
    const contractTypes = searchParams.getAll("contractType").flatMap((value) => value.split(",")).map((value) => value.trim()).filter(Boolean);
    const cacheableContractType = contractTypes.length === 1 && !authority && !contractors.length && !cpvs.length ? contractTypes[0] : null;

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
      p_contract_type: cacheableContractType ? [cacheableContractType] : null,
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
