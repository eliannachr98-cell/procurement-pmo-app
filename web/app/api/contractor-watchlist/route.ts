import { NextResponse } from "next/server";
import { supabaseGet, supabaseWrite, requireAlertCode } from "@/lib/matching";

export const dynamic = "force-dynamic";

type ContractorWatchlistRow = { contractor_value: string; created_at: string };

export async function GET(request: Request) {
  if (!requireAlertCode(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const items = await supabaseGet<ContractorWatchlistRow[]>("contractor_watchlist?select=contractor_value,created_at&order=created_at.desc");
    return NextResponse.json({ items });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown contractor-watchlist error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!requireAlertCode(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const body = await request.json().catch(() => ({}));
    const contractorValue = typeof body.contractor_value === "string" ? body.contractor_value.trim() : "";
    if (!contractorValue) return NextResponse.json({ error: "contractor_value απαιτείται" }, { status: 400 });

    // Idempotent, same as cpv_watchlist.
    const items = await supabaseWrite<ContractorWatchlistRow[]>(
      "contractor_watchlist",
      "POST",
      [{ contractor_value: contractorValue }],
      "return=representation,resolution=merge-duplicates",
    );
    return NextResponse.json({ items });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown contractor-watchlist error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  if (!requireAlertCode(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const contractorValue = new URL(request.url).searchParams.get("contractor_value")?.trim() ?? "";
    if (!contractorValue) return NextResponse.json({ error: "contractor_value απαιτείται" }, { status: 400 });
    await supabaseWrite(`contractor_watchlist?contractor_value=eq.${encodeURIComponent(contractorValue)}`, "DELETE", undefined, "return=minimal");
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown contractor-watchlist error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
