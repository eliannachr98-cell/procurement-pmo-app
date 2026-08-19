import { NextResponse } from "next/server";
import {
  intersect,
  procurementAdamsForContractor,
  procurementAdamsForCpv,
  supabaseRpc,
  union,
} from "@/lib/matching";

export const dynamic = "force-dynamic";
// Some filter combinations (e.g. two large Τύπος σύμβασης categories at
// once) genuinely need more than Vercel's 10s default to finish against
// the compact tables - matches the raised anon-role statement_timeout
// in sql/raise_anon_statement_timeout.sql.
export const maxDuration = 120;

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
    // A single Τύπος σύμβασης value with nothing else active is precomputed
    // into dashboard_cache by refresh_dashboard_caches() and served straight
    // from there inside dashboard_breakdown(). Any other combination (several
    // types at once, or a type alongside authority/contractor/CPV) falls
    // through to the live query - that used to reliably blow past PostgREST's
    // own ~15s timeout no matter how selective the filter was, until we found
    // the actual cause: the `anon` role's statement_timeout was fixed at 15s
    // on the role itself (see sql/raise_anon_statement_timeout.sql), a
    // deadline latched before the function's own SET LOCAL ever ran. Now that
    // it's raised, the live path has enough headroom for any combination.
    const contractTypes = searchParams.getAll("contractType").flatMap((value) => value.split(",")).map((value) => value.trim()).filter(Boolean);

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
      p_contract_type: contractTypes.length ? contractTypes : null,
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
