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
  nuts: { nuts_code: string; nuts_name: string; count: number }[];
  monthly: { month: string; count: number; budget: number; authorities: number; cpv: number }[];
};

export async function GET(request: Request) {
  try {
    const searchParams = new URL(request.url).searchParams;
    // The dashboard charts/tables count "διαγωνισμοί" only (already fixed to
    // declaration/announcement notices) - Τύπος εγγράφου and Τύπος σύμβασης
    // describe a different axis of the same records and were also
    // expensive enough on a low-selectivity value (e.g. "Προμήθειες" alone,
    // tens of thousands of rows with no year to narrow it) to time out the
    // live query. Only authority/contractor/cpv/year narrow this view.
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
      return NextResponse.json({ total: 0, status: [], cpv: [], nuts: [], monthly: [] } satisfies Breakdown);
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
