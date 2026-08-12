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
  status: { status: string; count: number }[];
  cpv: { cpv_code: string; cpv_description: string | null; count: number }[];
  nuts: { nuts_name: string; count: number }[];
};

export async function GET(request: Request) {
  try {
    const searchParams = new URL(request.url).searchParams;
    const query = searchParams.get("q")?.trim() ?? "";
    const authority = searchParams.get("authority")?.trim() ?? "";
    const contractors = searchParams.getAll("contractor").flatMap((value) => value.split(",")).map((value) => value.trim()).filter(Boolean);
    const cpvs = searchParams.getAll("cpv").flatMap((value) => value.split(",")).map((value) => value.trim()).filter(Boolean);
    const year = searchParams.get("year")?.trim() ?? "";
    const contractTypes = searchParams.getAll("contractType").flatMap((value) => value.split(",")).map((value) => value.trim()).filter(Boolean);
    const documentType = searchParams.get("documentType")?.trim() ?? "";

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
      return NextResponse.json({ total: 0, status: [], cpv: [], nuts: [] } satisfies Breakdown);
    }

    const breakdown = await supabaseRpc<Breakdown>("dashboard_breakdown", {
      p_query: query || null,
      p_authority: authority || null,
      p_year: /^\d{4}$/.test(year) ? year : null,
      p_contract_type: contractTypes.length ? contractTypes : null,
      p_document_type: documentType || null,
      p_adams: matchingAdams,
    });

    return NextResponse.json(breakdown, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown dashboard error";
    console.error(`[dashboard-api] ${message}`);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
