import { NextResponse } from "next/server";
import { supabaseGet, supabaseWrite, requireAlertCode } from "@/lib/matching";

export const dynamic = "force-dynamic";

type SubmissionRow = { adam: string; marked_at: string };

export async function GET(request: Request) {
  if (!requireAlertCode(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const items = await supabaseGet<SubmissionRow[]>("alert_submissions?select=adam,marked_at");
    return NextResponse.json({ items });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown alert-submissions error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!requireAlertCode(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const body = await request.json().catch(() => ({}));
    const adam = typeof body.adam === "string" ? body.adam.trim() : "";
    if (!adam) return NextResponse.json({ error: "adam απαιτείται" }, { status: 400 });
    const items = await supabaseWrite<SubmissionRow[]>(
      "alert_submissions",
      "POST",
      [{ adam }],
      "return=representation,resolution=merge-duplicates",
    );
    return NextResponse.json({ items });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown alert-submissions error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  if (!requireAlertCode(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const adam = new URL(request.url).searchParams.get("adam")?.trim() ?? "";
    if (!adam) return NextResponse.json({ error: "adam απαιτείται" }, { status: 400 });
    await supabaseWrite(`alert_submissions?adam=eq.${encodeURIComponent(adam)}`, "DELETE", undefined, "return=minimal");
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown alert-submissions error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
