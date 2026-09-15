import { NextResponse } from "next/server";
import { supabaseGet, supabaseWrite, resolveTeam } from "@/lib/matching";

export const dynamic = "force-dynamic";

type InterestRow = { adam: string; marked_at: string };

export async function GET(request: Request) {
  const team = await resolveTeam(request);
  if (!team) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const items = await supabaseGet<InterestRow[]>(`alert_interests?select=adam,marked_at&team_id=eq.${team.id}`);
    return NextResponse.json({ items });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown alert-interests error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const team = await resolveTeam(request);
  if (!team) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const body = await request.json().catch(() => ({}));
    const adam = typeof body.adam === "string" ? body.adam.trim() : "";
    if (!adam) return NextResponse.json({ error: "adam απαιτείται" }, { status: 400 });
    const items = await supabaseWrite<InterestRow[]>(
      "alert_interests",
      "POST",
      [{ team_id: team.id, adam }],
      "return=representation,resolution=merge-duplicates",
    );
    return NextResponse.json({ items });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown alert-interests error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const team = await resolveTeam(request);
  if (!team) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const adam = new URL(request.url).searchParams.get("adam")?.trim() ?? "";
    if (!adam) return NextResponse.json({ error: "adam απαιτείται" }, { status: 400 });
    await supabaseWrite(`alert_interests?team_id=eq.${team.id}&adam=eq.${encodeURIComponent(adam)}`, "DELETE", undefined, "return=minimal");
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown alert-interests error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
