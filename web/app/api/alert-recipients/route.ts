import { NextResponse } from "next/server";
import { supabaseGet, supabaseWrite, requireAlertCode } from "@/lib/matching";

export const dynamic = "force-dynamic";

type RecipientRow = { email: string; created_at: string };

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function GET(request: Request) {
  if (!requireAlertCode(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const items = await supabaseGet<RecipientRow[]>("alert_recipients?select=email,created_at&order=created_at.desc");
    return NextResponse.json({ items });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown alert-recipients error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!requireAlertCode(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const body = await request.json().catch(() => ({}));
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    if (!EMAIL_PATTERN.test(email)) return NextResponse.json({ error: "Έγκυρο email απαιτείται" }, { status: 400 });

    const items = await supabaseWrite<RecipientRow[]>(
      "alert_recipients",
      "POST",
      [{ email }],
      "return=representation,resolution=merge-duplicates",
    );
    return NextResponse.json({ items });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown alert-recipients error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  if (!requireAlertCode(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const email = new URL(request.url).searchParams.get("email")?.trim().toLowerCase() ?? "";
    if (!email) return NextResponse.json({ error: "email απαιτείται" }, { status: 400 });
    await supabaseWrite(`alert_recipients?email=eq.${encodeURIComponent(email)}`, "DELETE", undefined, "return=minimal");
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown alert-recipients error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
