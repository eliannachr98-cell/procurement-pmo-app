import { NextResponse } from "next/server";
import { supabaseGet } from "@/lib/matching";

export const dynamic = "force-dynamic";

type CacheRow = { refreshed_at: string };

export async function GET() {
  try {
    // dashboard_cache's "all" row is rebuilt at the end of every daily
    // sync run, so its refreshed_at is a reliable proxy for "when was the
    // underlying data last synced from KHMDHS" without needing a dedicated
    // sync-log table of our own.
    const rows = await supabaseGet<CacheRow[]>("dashboard_cache?select=refreshed_at&cache_key=eq.all&limit=1");
    return NextResponse.json({ refreshedAt: rows[0]?.refreshed_at ?? null });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown last-sync error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
