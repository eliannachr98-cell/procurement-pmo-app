import { NextResponse } from "next/server";
import { supabaseGet, supabaseWrite, resolveTeam } from "@/lib/matching";

export const dynamic = "force-dynamic";

type Row = { authority_name: string; created_at: string };

export async function GET(request: Request) {
  const team = await resolveTeam(request);
  if (!team) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const items = await supabaseGet<Row[]>(`authority_watchlist?select=authority_name,created_at&team_id=eq.${team.id}&order=created_at.asc`);
    return NextResponse.json({ items });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown authority-watchlist error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const team = await resolveTeam(request);
  if (!team) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const body = await request.json().catch(() => ({}));
    const key = typeof body.authority_name === "string" ? body.authority_name.trim() : "";
    if (!key) return NextResponse.json({ error: "authority_name απαιτείται" }, { status: 400 });
    const items = await supabaseWrite<Row[]>(
      "authority_watchlist",
      "POST",
      [{ team_id: team.id, authority_name: key }],
      "return=representation,resolution=merge-duplicates",
    );
    return NextResponse.json({ items });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown authority-watchlist error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const team = await resolveTeam(request);
  if (!team) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const key = new URL(request.url).searchParams.get("authority_name")?.trim() ?? "";
    if (!key) return NextResponse.json({ error: "authority_name απαιτείται" }, { status: 400 });
    await supabaseWrite(`authority_watchlist?team_id=eq.${team.id}&authority_name=eq.${encodeURIComponent(key)}`, "DELETE", undefined, "return=minimal");
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown authority-watchlist error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
