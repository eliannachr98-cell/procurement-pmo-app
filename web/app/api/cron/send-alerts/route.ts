import { NextResponse } from "next/server";
import { supabaseGet, supabaseRpc, supabaseWrite } from "@/lib/matching";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type WatchlistRow = { cpv_code: string };
type NutsFilterRow = { nuts_code: string };
type RecipientRow = { email: string };
type CandidateRow = {
  adam: string;
  title: string;
  authority: string;
  documentType: string;
  publicationDate: string | null;
  openingDate: string | null;
  budget: number;
  description: string | null;
};

const documentTypeLabels: Record<string, string> = {
  declaration: "Διακήρυξη",
  announcement: "Προκήρυξη",
  extension: "Παράταση / μετάθεση",
};

function formatDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("el-GR").format(date);
}

function buildEmailHtml(items: CandidateRow[]) {
  const euro = new Intl.NumberFormat("el-GR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
  const cards = items.map((item) => `
    <div style="border:1px solid #e1edf0;border-radius:10px;padding:16px;margin-bottom:14px;">
      <div style="color:#6a7e8b;font-size:11px;text-transform:uppercase;letter-spacing:.3px;margin-bottom:4px;">${item.authority} · ${documentTypeLabels[item.documentType] ?? item.documentType}</div>
      <div style="font-weight:700;font-size:15px;color:#16222c;margin-bottom:8px;">${item.title}</div>
      ${item.description ? `<div style="color:#3d5666;font-size:13px;margin-bottom:10px;">${item.description}</div>` : ""}
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <tr>
          <td style="padding:4px 0;color:#6a7e8b;width:50%;">Καταληκτική υποβολής προσφορών</td>
          <td style="padding:4px 0;font-weight:600;">${formatDate(item.openingDate)}</td>
        </tr>
        <tr>
          <td style="padding:4px 0;color:#6a7e8b;">Ποσό</td>
          <td style="padding:4px 0;font-weight:600;">${euro.format(item.budget)}</td>
        </tr>
      </table>
      <div style="color:#9aa7ae;font-size:11px;margin-top:8px;">ΑΔΑΜ ${item.adam}</div>
    </div>`).join("");
  return `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:640px;margin:0 auto;color:#16222c;">
      <h2 style="color:#0c3b59;margin:0 0 4px;">TenderScope</h2>
      <p style="color:#6a7e8b;font-size:13px;margin:0 0 20px;">${items.length} νέα στοιχεία στα CPV που παρακολουθείς.</p>
      ${cards}
      <p style="color:#6a7e8b;font-size:11px;margin-top:12px;">Αναζήτησε τον κωδικό ΑΔΑΜ μέσα στο TenderScope για τα πλήρη στοιχεία.</p>
    </div>`;
}

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
    const dryRun = new URL(request.url).searchParams.get("dryRun") === "true";

    const [watchlist, nutsFilter, recipients] = await Promise.all([
      supabaseGet<WatchlistRow[]>("cpv_watchlist?select=cpv_code"),
      supabaseGet<NutsFilterRow[]>("alert_nuts_filter?select=nuts_code"),
      supabaseGet<RecipientRow[]>("alert_recipients?select=email"),
    ]);

    if (!watchlist.length) return NextResponse.json({ sent: false, reason: "no CPVs on the watchlist", candidateCount: 0 });
    if (!recipients.length) return NextResponse.json({ sent: false, reason: "no email recipients", candidateCount: 0 });

    // See sql/alert_email_candidates.sql for the selection/dedup logic -
    // new declaration/announcement (deduped when a real tender has both),
    // plus extensions for tenders already marked Υποβλήθηκε/Ενδιαφέρον.
    const candidates = await supabaseRpc<CandidateRow[]>("alert_email_candidates", {
      p_cpv_codes: watchlist.map((item) => item.cpv_code),
      p_nuts_prefixes: nutsFilter.length ? nutsFilter.map((item) => item.nuts_code) : null,
      p_days: 14,
    });

    if (!candidates.length) return NextResponse.json({ sent: false, reason: "no new candidates", candidateCount: 0 });
    if (dryRun) return NextResponse.json({ sent: false, dryRun: true, candidateCount: candidates.length, candidates });

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "RESEND_API_KEY missing" }, { status: 500 });

    const html = buildEmailHtml(candidates);
    const from = process.env.ALERT_EMAIL_FROM ?? "TenderScope <onboarding@resend.dev>";
    const subject = `${candidates.length} νέα στοιχεία διαγωνισμών - TenderScope`;

    // One request per recipient (not one email with everyone in "to") so
    // recipients never see each other's addresses.
    const results = await Promise.allSettled(recipients.map((recipient) =>
      fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from, to: [recipient.email], subject, html }),
      }).then((response) => {
        if (!response.ok) throw new Error(`Resend ${response.status} for ${recipient.email}`);
      }),
    ));
    const failures = results.filter((result): result is PromiseRejectedResult => result.status === "rejected");

    // Mark every candidate as notified regardless of per-recipient send
    // failures - resending to a retry-worthy address later is easy (delete
    // the alert_notifications_sent row), but silently re-notifying everyone
    // about the same batch on every future run because one address bounced
    // would be worse.
    await supabaseWrite(
      "alert_notifications_sent",
      "POST",
      candidates.map((item) => ({ adam: item.adam })),
      "return=minimal,resolution=merge-duplicates",
    );

    return NextResponse.json({
      sent: true,
      candidateCount: candidates.length,
      recipientCount: recipients.length,
      failedRecipients: failures.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown send-alerts error";
    console.error(`[send-alerts] ${message}`);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
