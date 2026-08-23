import { NextResponse } from "next/server";
import { supabaseGet, supabaseRpc, supabaseWrite, requireAlertCode } from "@/lib/matching";
import { CandidateRow, sendAlertEmailToRecipient } from "@/lib/alertEmail";

export const dynamic = "force-dynamic";

type RecipientRow = { email: string; created_at: string };
type WatchlistRow = { cpv_code: string };
type NutsFilterRow = { nuts_code: string };

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

    // Send the catch-up email right away instead of making a brand-new
    // recipient wait for the next scheduled daily run - it then falls into
    // the same alert_notifications_sent-tracked logic as everyone else, so
    // tomorrow's cron only sends them genuinely new items. Best-effort: a
    // failure here (missing key, Resend hiccup, no CPVs on the watchlist
    // yet) doesn't undo the recipient add - the daily cron will still pick
    // them up as a catch-up next time since nothing gets marked sent unless
    // the send actually succeeds.
    let welcomeEmailSent = false;
    try {
      const apiKey = process.env.RESEND_API_KEY;
      if (apiKey) {
        const [watchlist, nutsFilter] = await Promise.all([
          supabaseGet<WatchlistRow[]>("cpv_watchlist?select=cpv_code"),
          supabaseGet<NutsFilterRow[]>("alert_nuts_filter?select=nuts_code"),
        ]);
        if (watchlist.length) {
          const candidates = await supabaseRpc<CandidateRow[]>("alert_email_candidates", {
            p_recipient_email: email,
            p_cpv_codes: watchlist.map((item) => item.cpv_code),
            p_nuts_prefixes: nutsFilter.length ? nutsFilter.map((item) => item.nuts_code) : null,
          });
          const from = process.env.ALERT_EMAIL_FROM ?? "TenderScope <onboarding@resend.dev>";
          welcomeEmailSent = await sendAlertEmailToRecipient(email, candidates, apiKey, from);
        }
      }
    } catch {
      // Swallow - the recipient is added either way, see comment above.
    }

    return NextResponse.json({ items, welcomeEmailSent });
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
