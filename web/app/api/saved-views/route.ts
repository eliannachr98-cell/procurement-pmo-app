import { NextResponse } from "next/server";
import { supabaseGet, supabaseWrite, requireAlertCode } from "@/lib/matching";

export const dynamic = "force-dynamic";

type SavedViewRow = { id: string; name: string; filters: Record<string, unknown>; created_at: string };

export async function GET(request: Request) {
  if (!requireAlertCode(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const items = await supabaseGet<SavedViewRow[]>("saved_views?select=id,name,filters,created_at&order=created_at.desc");
    return NextResponse.json({ items });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown saved-views error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!requireAlertCode(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const body = await request.json().catch(() => ({}));
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) return NextResponse.json({ error: "name απαιτείται" }, { status: 400 });
    const filters = body.filters && typeof body.filters === "object" ? body.filters : {};

    const items = await supabaseWrite<SavedViewRow[]>(
      "saved_views",
      "POST",
      [{ name, filters }],
      "return=representation",
    );
    return NextResponse.json({ items });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown saved-views error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  if (!requireAlertCode(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const id = new URL(request.url).searchParams.get("id")?.trim() ?? "";
    if (!id) return NextResponse.json({ error: "id απαιτείται" }, { status: 400 });
    await supabaseWrite(`saved_views?id=eq.${encodeURIComponent(id)}`, "DELETE", undefined, "return=minimal");
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown saved-views error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
