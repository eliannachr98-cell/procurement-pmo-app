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
  isSubmitted: boolean;
  isInterested: boolean;
};

const documentTypeLabels: Record<string, string> = {
  declaration: "Διακήρυξη",
  announcement: "Προκήρυξη",
  extension: "Παράταση / μετάθεση",
};

// Same tone mapping as .status badges in the app (page.tsx statusTone) -
// keeps the email visually consistent with TenderScope rather than picking
// new colors.
const documentTypeAccent: Record<string, string> = {
  declaration: "#168c8c",
  announcement: "#367ca1",
  extension: "#2e8b57",
};

function formatDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("el-GR").format(date);
}

function renderCards(items: CandidateRow[]) {
  const euro = new Intl.NumberFormat("el-GR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
  return items.map((item) => {
    const accent = documentTypeAccent[item.documentType] ?? "#5f6f7d";
    return `
    <tr><td style="padding:0 0 14px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;background:#ffffff;border:1px solid #e1edf0;border-left:4px solid ${accent};border-radius:10px;">
        <tr><td style="padding:16px 18px;">
          <div style="display:inline-block;background:${accent};color:#ffffff;font-size:10px;font-weight:700;letter-spacing:.3px;text-transform:uppercase;padding:3px 9px;border-radius:20px;margin-bottom:10px;">${documentTypeLabels[item.documentType] ?? item.documentType}</div>
          <div style="color:#6a7e8b;font-size:11px;margin-bottom:2px;">${item.authority}</div>
          <div style="font-weight:700;font-size:15px;line-height:1.35;color:#16222c;margin-bottom:${item.description ? "8px" : "12px"};">${item.title}</div>
          ${item.description ? `<div style="color:#3d5666;font-size:13px;line-height:1.4;margin-bottom:12px;">${item.description}</div>` : ""}
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #eef3f5;padding-top:10px;">
            <tr>
              <td style="padding-top:10px;color:#6a7e8b;font-size:12px;width:60%;">Ημερομηνία δημοσίευσης</td>
              <td style="padding-top:10px;color:#16222c;font-size:13px;font-weight:700;text-align:right;">${formatDate(item.publicationDate)}</td>
            </tr>
            <tr>
              <td style="padding-top:4px;color:#6a7e8b;font-size:12px;">Καταληκτική υποβολής προσφορών</td>
              <td style="padding-top:4px;color:#16222c;font-size:13px;font-weight:700;text-align:right;">${formatDate(item.openingDate)}</td>
            </tr>
            <tr>
              <td style="padding-top:4px;color:#6a7e8b;font-size:12px;">Ποσό</td>
              <td style="padding-top:4px;color:#16222c;font-size:13px;font-weight:700;text-align:right;">${euro.format(item.budget)}</td>
            </tr>
          </table>
          <div style="color:#b3bec5;font-size:10px;margin-top:10px;">ΑΔΑΜ ${item.adam}</div>
        </td></tr>
      </table>
    </td></tr>`;
  }).join("");
}

function renderSection(heading: string, subheading: string, items: CandidateRow[]) {
  if (!items.length) return "";
  return `
    <tr><td style="padding:20px 24px 4px;">
      <div style="color:#16222c;font-size:14px;font-weight:700;margin-bottom:2px;">${heading}</div>
      <div style="color:#6a7e8b;font-size:11px;margin-bottom:14px;">${subheading}</div>
    </td></tr>
    <tr><td style="padding:0 24px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${renderCards(items)}</table>
    </td></tr>`;
}

// Three separate sections rather than one flat chronological list: brand-new
// tenders that match the CPV watchlist, vs. updates (i.e. Παρατάσεις) on
// tenders already marked Υποβλήθηκε or Ενδιαφέρον - explicitly requested so
// each reads as its own group instead of being mixed together. A tender can
// be in both the submitted and interested section at once since the two
// toggles in the app aren't mutually exclusive.
function buildEmailHtml(items: CandidateRow[]) {
  const appUrl = "https://procurement-pmo-app.vercel.app";
  const newItems = items.filter((item) => item.documentType !== "extension");
  const submittedUpdates = items.filter((item) => item.documentType === "extension" && item.isSubmitted);
  const interestedUpdates = items.filter((item) => item.documentType === "extension" && item.isInterested);

  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef3f6;padding:32px 12px;font-family:Arial,Helvetica,sans-serif;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:14px;overflow:hidden;">
        <tr><td style="background:linear-gradient(118deg,#0a3855,#155878 68%,#247b8d);padding:26px 28px;">
          <div style="color:#ffffff;font-size:19px;font-weight:700;letter-spacing:.2px;">⌖ TenderScope</div>
          <div style="color:#cfe3ea;font-size:12px;margin-top:3px;">Ελληνικό Παρατηρητήριο Δημοσίων Συμβάσεων</div>
        </td></tr>
        <tr><td style="padding:24px 24px 4px;">
          <div style="color:#16222c;font-size:15px;font-weight:700;margin-bottom:2px;">${items.length} ενημερώσεις</div>
          <div style="color:#6a7e8b;font-size:12px;margin-bottom:4px;">Ταξινομημένα κατά ημερομηνία δημοσίευσης, πιο πρόσφατα πρώτα.</div>
        </td></tr>
        ${renderSection("Νέοι διαγωνισμοί", "Ταιριάζουν στα CPV που παρακολουθείς.", newItems)}
        ${renderSection("Ενημερώσεις σε προσφορές που έχουμε υποβάλει", "Παράταση/μετάθεση σε διαγωνισμό που έχει σημανθεί ως Υποβληθείσα.", submittedUpdates)}
        ${renderSection("Ενημερώσεις σε διαγωνισμούς που μας ενδιαφέρουν", "Παράταση/μετάθεση σε διαγωνισμό που έχει σημανθεί ως Ενδιαφέρον.", interestedUpdates)}
        <tr><td style="padding:22px 24px 26px;border-top:1px solid #eef3f5;">
          <div style="color:#9aa7ae;font-size:11px;">Αναζήτησε τον κωδικό ΑΔΑΜ μέσα στο <a href="${appUrl}" style="color:#168c8c;text-decoration:none;font-weight:600;">TenderScope</a> για τα πλήρη στοιχεία. Για να σταματήσεις αυτές τις ειδοποιήσεις, αφαίρεσε το email σου από τη σελίδα Ειδοποιήσεις της εφαρμογής.</div>
        </td></tr>
      </table>
    </td></tr>
  </table>`;
}

// Triggered by Vercel Cron (see web/vercel.json). Vercel sends
// `Authorization: Bearer $CRON_SECRET` automatically once CRON_SECRET is
// set as an env var - until then this stays open (fine for the ?dryRun=true
// manual testing phase, not for real sending).
// TEMP diagnostic branch to visually verify the 3-section split with
// realistic data, without touching procurements_compact/alert_submissions/
// alert_interests. Remove once confirmed looking right.
async function sendPreview(apiKey: string, from: string, to: string) {
  const sample: CandidateRow[] = [
    {
      adam: "26PROC019660487",
      title: "Υποστηρικτικές υπηρεσίες για την υπαγωγή σε Π.Π.Δ. αθλητικών εγκαταστάσεων Δ. Μαρωνείας-Σαπών",
      authority: "ΔΗΜΟΣ ΜΑΡΩΝΕΙΑΣ - ΣΑΠΩΝ",
      documentType: "declaration",
      publicationDate: "2026-08-21",
      openingDate: "2026-08-28T10:00:00+00:00",
      budget: 4960,
      description: "Υπηρεσίες τεχνικής υποστήριξης",
      isSubmitted: false,
      isInterested: false,
    },
    {
      adam: "26PROC019561699-EXT",
      title: 'ΠΑΡΑΤΑΣΗ - ΔΙΑΚΗΡΥΞΗ ΓΙΑ ΤΗΝ ΠΡΟΜΗΘΕΙΑ ΜΕ ΤΙΤΛΟ "ΔΡΑΣΕΙΣ ΨΗΦΙΑΚΟΥ ΜΕΤΑΣΧΗΜΑΤΙΣΜΟΥ ΔΗΜΟΥ ΗΛΙΟΥΠΟΛΗΣ"',
      authority: "ΔΗΜΟΣ ΗΛΙΟΥΠΟΛΗΣ",
      documentType: "extension",
      publicationDate: "2026-08-22",
      openingDate: "2026-09-14T11:00:00+00:00",
      budget: 1635310.71,
      description: "Υπηρεσίες τεχνικής υποστήριξης",
      isSubmitted: true,
      isInterested: false,
    },
    {
      adam: "26PROC019525300-EXT",
      title: "ΠΑΡΑΤΑΣΗ - ΔΙΑΚΗΡΥΞΗ 18/2026 ΔΙΑΓ. ΓΙΑ ΣΥΜΒΟΥΛ. ΥΠΗΡ. ΓΙΑ ΜΕΤΑΒΑΣΗ ΣΕ ΟΛΟΚΛ. ΚΕΝΤΡΟ ΚΑΡΚΙΝΟΥ",
      authority: "ΠΕΡ.ΓΕΝ. ΝΟΣΟΚΟΜΕΙΟ ΑΝΤΙΚΑΡΚΙΝΙΚΟ 'ΜΕΤΑΞΑ'",
      documentType: "extension",
      publicationDate: "2026-08-22",
      openingDate: "2026-09-20T23:59:00+00:00",
      budget: 2250000,
      description: "Υπηρεσίες παροχής επιχειρηματικών συμβουλών και συμβουλών σε θέματα διαχείρισης",
      isSubmitted: false,
      isInterested: true,
    },
  ];
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: [to],
      subject: "[TEST] Προεπισκόπηση 3 ενοτήτων - TenderScope",
      html: buildEmailHtml(sample),
    }),
  });
  return response.ok;
}

export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const url = new URL(request.url);
    if (url.searchParams.get("previewSections") === "true") {
      const apiKey = process.env.RESEND_API_KEY;
      if (!apiKey) return NextResponse.json({ error: "RESEND_API_KEY missing" }, { status: 500 });
      const to = url.searchParams.get("to") ?? "eliannachr.98@gmail.com";
      const ok = await sendPreview(apiKey, process.env.ALERT_EMAIL_FROM ?? "TenderScope <onboarding@resend.dev>", to);
      return NextResponse.json({ preview: true, sent: ok });
    }

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
    // since their last run.
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
      try {
        const response = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from,
            to: [email],
            subject: `${candidates.length} ενεργά στοιχεία διαγωνισμών - TenderScope`,
            html: buildEmailHtml(candidates),
          }),
        });
        if (!response.ok) throw new Error(`Resend ${response.status}`);
        // Only mark as sent on a confirmed successful send - a transient
        // failure should retry with the same items next run, not silently
        // drop them.
        await supabaseWrite(
          "alert_notifications_sent",
          "POST",
          candidates.map((item) => ({ recipient_email: email, adam: item.adam })),
          "return=minimal,resolution=merge-duplicates",
        );
        sentCount += 1;
        itemsSent += candidates.length;
      } catch {
        failedRecipients.push(email);
      }
    }

    return NextResponse.json({ sent: sentCount > 0, recipientsEmailed: sentCount, itemsSent, failedRecipients });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown send-alerts error";
    console.error(`[send-alerts] ${message}`);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
