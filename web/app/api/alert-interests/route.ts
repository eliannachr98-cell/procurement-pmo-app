import { NextResponse } from "next/server";
import { supabaseGet, supabaseWrite } from "@/lib/matching";

export const dynamic = "force-dynamic";

type InterestRow = { adam: string; marked_at: string };

export async function GET() {
  try {
    const items = await supabaseGet<InterestRow[]>("alert_interests?select=adam,marked_at");
    return NextResponse.json({ items });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown alert-interests error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const adam = typeof body.adam === "string" ? body.adam.trim() : "";
    if (!adam) return NextResponse.json({ error: "adam απαιτείται" }, { status: 400 });
    const items = await supabaseWrite<InterestRow[]>(
      "alert_interests",
      "POST",
      [{ adam }],
      "return=representation,resolution=merge-duplicates",
    );
    return NextResponse.json({ items });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown alert-interests error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const adam = new URL(request.url).searchParams.get("adam")?.trim() ?? "";
    if (!adam) return NextResponse.json({ error: "adam απαιτείται" }, { status: 400 });
    await supabaseWrite(`alert_interests?adam=eq.${encodeURIComponent(adam)}`, "DELETE", undefined, "return=minimal");
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown alert-interests error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
