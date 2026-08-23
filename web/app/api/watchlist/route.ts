import { NextResponse } from "next/server";
import { supabaseGet, supabaseWrite, requireAlertCode } from "@/lib/matching";

export const dynamic = "force-dynamic";

type WatchlistRow = { cpv_code: string; cpv_label: string | null; created_at: string };

export async function GET(request: Request) {
  if (!requireAlertCode(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const items = await supabaseGet<WatchlistRow[]>("cpv_watchlist?select=cpv_code,cpv_label,created_at&order=created_at.desc");
    return NextResponse.json({ items });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown watchlist error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!requireAlertCode(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const body = await request.json().catch(() => ({}));
    const cpvCode = typeof body.cpv_code === "string" ? body.cpv_code.trim() : "";
    if (!cpvCode) return NextResponse.json({ error: "cpv_code απαιτείται" }, { status: 400 });
    const cpvLabel = typeof body.cpv_label === "string" ? body.cpv_label.trim() : null;

    // Idempotent: adding an already-watched CPV just updates its label.
    const items = await supabaseWrite<WatchlistRow[]>(
      "cpv_watchlist",
      "POST",
      [{ cpv_code: cpvCode, cpv_label: cpvLabel }],
      "return=representation,resolution=merge-duplicates",
    );
    return NextResponse.json({ items });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown watchlist error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  if (!requireAlertCode(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const cpvCode = new URL(request.url).searchParams.get("cpv_code")?.trim() ?? "";
    if (!cpvCode) return NextResponse.json({ error: "cpv_code απαιτείται" }, { status: 400 });
    await supabaseWrite(`cpv_watchlist?cpv_code=eq.${encodeURIComponent(cpvCode)}`, "DELETE", undefined, "return=minimal");
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown watchlist error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
