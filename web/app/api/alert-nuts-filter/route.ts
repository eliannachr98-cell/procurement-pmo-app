import { NextResponse } from "next/server";
import { supabaseGet, supabaseWrite } from "@/lib/matching";

export const dynamic = "force-dynamic";

type NutsFilterRow = { nuts_code: string; nuts_name: string | null; created_at: string };

export async function GET() {
  try {
    const items = await supabaseGet<NutsFilterRow[]>("alert_nuts_filter?select=nuts_code,nuts_name,created_at&order=created_at.desc");
    return NextResponse.json({ items });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown alert-nuts-filter error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const nutsCode = typeof body.nuts_code === "string" ? body.nuts_code.trim() : "";
    if (!nutsCode) return NextResponse.json({ error: "nuts_code απαιτείται" }, { status: 400 });
    const nutsName = typeof body.nuts_name === "string" ? body.nuts_name.trim() : null;

    const items = await supabaseWrite<NutsFilterRow[]>(
      "alert_nuts_filter",
      "POST",
      [{ nuts_code: nutsCode, nuts_name: nutsName }],
      "return=representation,resolution=merge-duplicates",
    );
    return NextResponse.json({ items });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown alert-nuts-filter error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const nutsCode = new URL(request.url).searchParams.get("nuts_code")?.trim() ?? "";
    if (!nutsCode) return NextResponse.json({ error: "nuts_code απαιτείται" }, { status: 400 });
    await supabaseWrite(`alert_nuts_filter?nuts_code=eq.${encodeURIComponent(nutsCode)}`, "DELETE", undefined, "return=minimal");
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown alert-nuts-filter error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
