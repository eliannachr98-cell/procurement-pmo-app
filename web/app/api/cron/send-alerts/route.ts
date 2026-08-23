import { NextResponse } from "next/server";
import { supabaseGet, supabaseRpc } from "@/lib/matching";
import { CandidateRow, sendAlertEmailToRecipient } from "@/lib/alertEmail";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type WatchlistRow = { cpv_code: string };
type NutsFilterRow = { nuts_code: string };
type RecipientRow = { email: string };

// Triggered by Vercel Cron (see web/vercel.json). Vercel sends
// `Authorization: Bearer $CRON_SECRET` automatically once CRON_SECRET is
// set as an env var - until then this stays open (fine for the ?dryRun=true
// manual testing phase, not for real sending).
export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const dryRun = url.searchParams.get("dryRun") === "true";

    const [watchlist, nutsFilter, recipients] = await Promise.all([
      supabaseGet<WatchlistRow[]>("cpv_watchlist?select=cpv_code"),
      supabaseGet<NutsFilterRow[]>("alert_nuts_filter?select=nuts_code"),
      supabaseGet<RecipientRow[]>("alert_recipients?select=email"),
    ]);

    if (!watchlist.length) return NextResponse.json({ sent: false, reason: "no CPVs on the watchlist" });
    if (!recipients.length) return NextResponse.json({ sent: false, reason: "no email recipients" });

    const apiKey = process.env.RESEND_API_KEY;
    if (!dryRun && !apiKey) return NextResponse.json({ error: "RESEND_API_KEY missing" }, { status: 500 });

    // Selection/dedup logic lives in sql/alert_email_candidates.sql: still-
    // ΕΝΕΡΓΟΣ (no award, deadline not passed) declaration/announcement -
    // deduped when a real tender has both - plus extensions for tenders
    // already marked Υποβλήθηκε/Ενδιαφέρον. Run PER recipient, since
    // alert_notifications_sent tracks what's already been sent to each
    // address individually - a brand-new recipient has nothing recorded
    // yet, so their first run naturally includes every currently-active
    // match as a catch-up; an existing recipient only sees what's new
    // since their last run. In practice a brand-new recipient gets their
    // catch-up immediately on registration instead (see api/alert-recipients),
    // so by the time this runs for them there's usually nothing left - this
    // loop is what still catches anyone added between two daily runs whose
    // immediate send failed, plus everyone's regular daily new items.
    const perRecipient = await Promise.all(recipients.map(async (recipient) => ({
      email: recipient.email,
      candidates: await supabaseRpc<CandidateRow[]>("alert_email_candidates", {
        p_recipient_email: recipient.email,
        p_cpv_codes: watchlist.map((item) => item.cpv_code),
        p_nuts_prefixes: nutsFilter.length ? nutsFilter.map((item) => item.nuts_code) : null,
      }),
    })));

    if (dryRun) {
      return NextResponse.json({
        sent: false,
        dryRun: true,
        recipients: perRecipient.map((r) => ({ email: r.email, candidateCount: r.candidates.length, candidates: r.candidates })),
      });
    }

    const from = process.env.ALERT_EMAIL_FROM ?? "TenderScope <onboarding@resend.dev>";
    let sentCount = 0;
    let itemsSent = 0;
    const failedRecipients: string[] = [];

    for (const { email, candidates } of perRecipient) {
      if (!candidates.length) continue;
      const ok = await sendAlertEmailToRecipient(email, candidates, apiKey!, from);
      if (ok) { sentCount += 1; itemsSent += candidates.length; } else { failedRecipients.push(email); }
    }

    return NextResponse.json({ sent: sentCount > 0, recipientsEmailed: sentCount, itemsSent, failedRecipients });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown send-alerts error";
    console.error(`[send-alerts] ${message}`);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
