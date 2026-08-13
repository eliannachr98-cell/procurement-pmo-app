import { NextResponse } from "next/server";
import { supabaseGet, supabaseRpc } from "@/lib/matching";

export const dynamic = "force-dynamic";

const ALERT_WINDOW_DAYS = 45;

type WatchlistRow = { cpv_code: string; cpv_label: string | null };
type AlertRow = {
  adam: string;
  title: string;
  authority: string;
  contractType: string | null;
  publicationDate: string | null;
  openingDate: string | null;
  budget: number;
  matchedCpv: string[];
  cpvs: { code: string; description: string | null }[];
};

export async function GET() {
  try {
    const watchlist = await supabaseGet<WatchlistRow[]>("cpv_watchlist?select=cpv_code,cpv_label&order=created_at.desc");
    if (!watchlist.length) return NextResponse.json({ watchlist, alerts: [] });

    // A single inlined query (see sql/alerts_feed.sql) - resolving each
    // watched CPV through the market-route matching helpers and paging
    // results back through PostgREST in chunks of 70 was fine for one
    // narrow code, but a few broad ones (e.g. general business consulting)
    // fanned out into hundreds of sequential round trips and timed out.
    const alerts = await supabaseRpc<AlertRow[]>("alerts_feed", {
      p_cpv_codes: watchlist.map((item) => item.cpv_code),
      p_days: ALERT_WINDOW_DAYS,
    });

    return NextResponse.json({ watchlist, alerts: alerts ?? [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown alerts error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
