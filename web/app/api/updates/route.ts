import { NextResponse } from "next/server";
import { resolveTeam, supabaseGet, supabaseRpc } from "@/lib/matching";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// The "Ενημερώσεις" of the Προφίλ: what happened in the last N days to the tenders,
// contractors and authorities the team follows (SQL function follow_updates).
export async function GET(request: Request) {
  const team = await resolveTeam(request);
  if (!team) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const days = Math.min(90, Math.max(1, Number(new URL(request.url).searchParams.get("days") ?? 30) || 30));
    const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
    const [tenders, authorities, contractors] = await Promise.all([
      supabaseGet<{ adam: string }[]>(`alert_interests?select=adam&team_id=eq.${team.id}`),
      supabaseGet<{ authority_name: string }[]>(`authority_watchlist?select=authority_name&team_id=eq.${team.id}`),
      supabaseGet<{ contractor_key: string }[]>(`followed_contractors?select=contractor_key&team_id=eq.${team.id}`),
    ]);
    const result = await supabaseRpc<unknown>("follow_updates", {
      p_adams: tenders.length ? tenders.map((item) => item.adam).slice(0, 200) : null,
      p_contractors: contractors.length ? contractors.map((item) => item.contractor_key).slice(0, 40) : null,
      p_authorities: authorities.length ? authorities.map((item) => item.authority_name).slice(0, 60) : null,
      p_since: since,
    });
    return NextResponse.json(
      { ...(result as Record<string, unknown>), followed: { tenders: tenders.length, contractors: contractors.length, authorities: authorities.length } },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown updates error";
    console.error(`[updates-api] ${message}`);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
