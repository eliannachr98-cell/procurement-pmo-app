import { NextResponse } from "next/server";
import { supabaseGet, supabaseWrite, resolveTeam } from "@/lib/matching";

export const dynamic = "force-dynamic";

type Row = { contractor_key: string; contractor_label: string | null; created_at: string };

export async function GET(request: Request) {
  const team = await resolveTeam(request);
  if (!team) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const items = await supabaseGet<Row[]>(`followed_contractors?select=contractor_key,contractor_label,created_at&team_id=eq.${team.id}&order=created_at.asc`);
    return NextResponse.json({ items });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown contractor-watchlist error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const team = await resolveTeam(request);
  if (!team) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const body = await request.json().catch(() => ({}));
    const key = typeof body.contractor_key === "string" ? body.contractor_key.trim() : "";
    if (!key) return NextResponse.json({ error: "contractor_key απαιτείται" }, { status: 400 });
    const label = typeof body.contractor_label === "string" ? body.contractor_label.trim() : null;
    const items = await supabaseWrite<Row[]>(
      "followed_contractors",
      "POST",
      [{ team_id: team.id, contractor_key: key, contractor_label: label }],
      "return=representation,resolution=merge-duplicates",
    );
    return NextResponse.json({ items });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown contractor-watchlist error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const team = await resolveTeam(request);
  if (!team) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const key = new URL(request.url).searchParams.get("contractor_key")?.trim() ?? "";
    if (!key) return NextResponse.json({ error: "contractor_key απαιτείται" }, { status: 400 });
    await supabaseWrite(`followed_contractors?team_id=eq.${team.id}&contractor_key=eq.${encodeURIComponent(key)}`, "DELETE", undefined, "return=minimal");
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown contractor-watchlist error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
