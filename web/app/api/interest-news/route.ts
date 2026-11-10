import { NextResponse } from "next/server";
import { resolveTeam, supabaseGet, supabaseRpc } from "@/lib/matching";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// How much is new, since a given date, for the CPVs, authorities and
// contractors the profile follows (shown in the Προφίλ).
export async function GET(request: Request) {
  const team = await resolveTeam(request);
  if (!team) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const since = new URL(request.url).searchParams.get("since")?.trim() ?? "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(since)) return NextResponse.json({ error: "since απαιτείται (YYYY-MM-DD)" }, { status: 400 });
    const [cpvs, authorities, contractors] = await Promise.all([
      supabaseGet<{ cpv_code: string }[]>(`cpv_watchlist?select=cpv_code&team_id=eq.${team.id}`),
      supabaseGet<{ authority_name: string }[]>(`authority_watchlist?select=authority_name&team_id=eq.${team.id}`),
      supabaseGet<{ contractor_key: string }[]>(`contractor_watchlist?select=contractor_key&team_id=eq.${team.id}`),
    ]);
    const news = await supabaseRpc<{ cpv: number; authorities: number; contractors: number; since: string }>("interest_news", {
      p_since: since,
      p_cpv: cpvs.length ? cpvs.map((item) => item.cpv_code) : null,
      p_authorities: authorities.length ? authorities.map((item) => item.authority_name) : null,
      p_contractors: contractors.length ? contractors.map((item) => item.contractor_key) : null,
    });
    return NextResponse.json(news, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown interest-news error";
    console.error(`[interest-news-api] ${message}`);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
