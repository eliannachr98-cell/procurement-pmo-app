import { NextResponse } from "next/server";
import { cachedScope, supabaseRpc } from "@/lib/matching";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// The "Αγορά & Ανταγωνισμός" tab: trend per month, ranking (per contractor or per
// authority) and the list of awards/contracts - SQL functions market_trend,
// market_ranking, market_documents over the ready-made facts tables.
export async function GET(request: Request) {
  try {
    const searchParams = new URL(request.url).searchParams;
    const list = (name: string) => searchParams.getAll(name).flatMap((value) => value.split("|")).map((value) => value.trim()).filter(Boolean).slice(0, 30);
    const view = searchParams.get("view") ?? "ranking";
    const year = /^\d{4}$/.test(searchParams.get("year") ?? "") ? (searchParams.get("year") as string) : null;
    const authorityRaw = searchParams.get("authority")?.trim() ?? "";
    const authority = authorityRaw && authorityRaw !== "Όλες" ? authorityRaw : null;
    const contractTypes = list("contractType");
    const cpvs = list("cpv");
    const contractors = list("contractor");
    const q = searchParams.get("q")?.trim().slice(0, 80) || null;
    const sort = (searchParams.get("sort") ?? "").replace(/[^a-z]/g, "").slice(0, 20) || undefined;
    const dir = searchParams.get("dir") === "asc" ? "asc" : "desc";
    const pageSize = Math.min(100, Math.max(10, Number(searchParams.get("pageSize") ?? 50) || 50));
    const page = Math.max(1, Number(searchParams.get("page") ?? 1) || 1);
    const filters = {
      p_year: year,
      p_authority: authority,
      p_contract_type: contractTypes.length ? contractTypes : null,
      p_cpv: cpvs.length ? cpvs : null,
      p_contractors: contractors.length ? contractors : null,
    };
    const compute = async () => {
      if (view === "trend") return supabaseRpc<unknown>("market_trend", filters);
      if (view === "documents") {
        return supabaseRpc<unknown>("market_documents", { ...filters, p_search: q, p_sort: sort ?? "date", p_dir: dir, p_limit: pageSize, p_offset: (page - 1) * pageSize });
      }
      const by = searchParams.get("by") === "authority" ? "authority" : "contractor";
      return supabaseRpc<unknown>("market_ranking", { p_by: by, ...filters, p_search: q, p_sort: sort ?? "value", p_dir: dir, p_limit: pageSize, p_offset: (page - 1) * pageSize });
    };
    // Searches are free text, so they are not stored; everything else is read-through cached (data changes once a day).
    const body = q ? await compute() : await cachedScope(`explorer:${view}`, { view, by: searchParams.get("by"), filters, sort, dir, pageSize, page }, compute);
    return NextResponse.json(body, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown market explorer error";
    console.error(`[market-explorer-api] ${message}`);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
