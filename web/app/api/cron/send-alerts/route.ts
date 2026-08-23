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
  contractors: string | null;
};

const documentTypeLabels: Record<string, string> = {
  declaration: "Διακήρυξη",
  announcement: "Προκήρυξη",
  extension: "Παράταση / μετάθεση",
  award: "Κατακύρωση",
};

// Same tone mapping as .status badges in the app (page.tsx statusTone) -
// keeps the email visually consistent with TenderScope rather than picking
// new colors. "award" has no equivalent status badge (Ανατεθειμένος uses
// "purple" there) so it gets the closest matching hex here. Each also gets a
// pale tint (badge color at ~6% opacity, precomputed since email clients
// can't reliably do color-mix()) used as the card's own background - a
// plain white card felt flat, and the tint keeps every card readably
// identifiable by type even before reading its badge.
const documentTypeAccent: Record<string, string> = {
  declaration: "#168c8c",
  announcement: "#367ca1",
  extension: "#2e8b57",
  award: "#7c5cbf",
};
const documentTypeTint: Record<string, string> = {
  declaration: "#eefaf9",
  announcement: "#eef5fa",
  extension: "#eef9f1",
  award: "#f5f1fb",
};

// Each of the 3 email sections gets its own identity color, independent of
// the per-card badge colors above (a section mixes badge types - e.g.
// "Υποβληθείσες" can hold both Παράταση and Κατακύρωση cards) so this is
// what actually separates one section from the next at a glance.
const sectionAccents = { new: "#168c8c", submitted: "#c07a1e", interested: "#b0447a" };
const sectionTints = { new: "#eafaf9", submitted: "#fbf1e3", interested: "#fbeef4" };

function formatDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("el-GR").format(date);
}

function renderCards(items: CandidateRow[]) {
  const euro = new Intl.NumberFormat("el-GR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
  return items.map((item) => {
    const accent = documentTypeAccent[item.documentType] ?? "#5f6f7d";
    const tint = documentTypeTint[item.documentType] ?? "#f6f8f9";
    const isAward = item.documentType === "award";
    // An award notice has no submission deadline (opening_at) - the
    // publication_date row instead reflects the award date - and its most
    // useful piece of info is who won, not the (already known) CPV
    // description, so contractors takes the description slot here.
    const infoLine = isAward ? item.contractors : item.description;
    return `
    <tr><td style="padding:0 0 14px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;background:${tint};border:1px solid #e1edf0;border-left:4px solid ${accent};border-radius:12px;">
        <tr><td style="padding:16px 18px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
            <td style="vertical-align:top;">
              <div style="display:inline-block;background:${accent};color:#ffffff;font-size:10px;font-weight:700;letter-spacing:.3px;text-transform:uppercase;padding:4px 10px;border-radius:20px;">${documentTypeLabels[item.documentType] ?? item.documentType}</div>
            </td>
            <td style="vertical-align:top;text-align:right;">
              <div style="color:${accent};font-size:15px;font-weight:800;white-space:nowrap;">${euro.format(item.budget)}</div>
            </td>
          </tr></table>
          <div style="color:#6a7e8b;font-size:11px;margin-top:10px;margin-bottom:2px;">${item.authority}</div>
          <div style="font-weight:700;font-size:15px;line-height:1.35;color:#16222c;margin-bottom:${infoLine ? "8px" : "12px"};">${item.title}</div>
          ${infoLine ? `<div style="color:#3d5666;font-size:13px;line-height:1.4;margin-bottom:12px;">${isAward ? `<b>Ανάδοχος:</b> ${infoLine}` : infoLine}</div>` : ""}
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;padding:2px 0;">
            <tr>
              <td style="padding:8px 10px 4px;color:#6a7e8b;font-size:11.5px;width:60%;">${isAward ? "Ημερομηνία κατακύρωσης" : "Ημερομηνία δημοσίευσης"}</td>
              <td style="padding:8px 10px 4px;color:#16222c;font-size:13px;font-weight:700;text-align:right;">${formatDate(item.publicationDate)}</td>
            </tr>
            ${isAward ? "" : `
            <tr>
              <td style="padding:4px 10px;color:#6a7e8b;font-size:11.5px;">Καταληκτική υποβολής προσφορών</td>
              <td style="padding:4px 10px;color:#16222c;font-size:13px;font-weight:700;text-align:right;">${formatDate(item.openingDate)}</td>
            </tr>`}
          </table>
          <div style="color:#a9b5bb;font-size:10px;margin-top:10px;letter-spacing:.2px;">ΑΔΑΜ ${item.adam}</div>
        </td></tr>
      </table>
    </td></tr>`;
  }).join("");
}

function renderSection(heading: string, subheading: string, items: CandidateRow[], accent: string) {
  if (!items.length) return "";
  return `
    <tr><td style="padding:26px 24px 0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
        <td style="width:4px;background:${accent};border-radius:2px;font-size:0;line-height:0;">&nbsp;</td>
        <td style="padding-left:12px;">
          <div style="color:#16222c;font-size:14px;font-weight:800;">${heading} <span style="display:inline-block;background:${accent};color:#ffffff;font-size:10px;font-weight:700;border-radius:10px;padding:1px 7px;margin-left:4px;vertical-align:middle;">${items.length}</span></div>
          <div style="color:#6a7e8b;font-size:11px;margin-top:3px;">${subheading}</div>
        </td>
      </tr></table>
    </td></tr>
    <tr><td style="padding:14px 24px 0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${renderCards(items)}</table>
    </td></tr>`;
}

// Three separate sections rather than one flat chronological list: brand-new
// tenders that match the CPV watchlist, vs. updates (Παρατάσεις AND
// Κατακυρώσεις) on tenders already marked Υποβλήθηκε or Ενδιαφέρον -
// explicitly requested so each reads as its own group instead of being mixed
// together. A tender can be in both the submitted and interested section at
// once since the two toggles in the app aren't mutually exclusive.
function buildEmailHtml(items: CandidateRow[]) {
  const appUrl = "https://procurement-pmo-app.vercel.app";
  const isUpdate = (item: CandidateRow) => item.documentType === "extension" || item.documentType === "award";
  const newItems = items.filter((item) => !isUpdate(item));
  const submittedUpdates = items.filter((item) => isUpdate(item) && item.isSubmitted);
  const interestedUpdates = items.filter((item) => isUpdate(item) && item.isInterested);

  const stat = (count: number, label: string, accent: string, tint: string) => count ? `
    <td style="padding-right:8px;padding-bottom:8px;">
      <div style="display:inline-block;background:${tint};color:${accent};font-size:11.5px;font-weight:700;padding:6px 13px;border-radius:20px;white-space:nowrap;">${count} ${label}</div>
    </td>` : "";

  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#e8eff2;padding:32px 12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,Helvetica,sans-serif;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden;">
        <tr><td style="background:linear-gradient(135deg,#0a3855 0%,#155878 55%,#1f7a8c 100%);padding:30px 28px;">
          <table role="presentation" cellpadding="0" cellspacing="0"><tr>
            <td style="width:38px;height:38px;background:rgba(255,255,255,.16);border-radius:10px;text-align:center;vertical-align:middle;font-size:18px;">⌖</td>
            <td style="padding-left:12px;vertical-align:middle;">
              <div style="color:#ffffff;font-size:19px;font-weight:800;letter-spacing:.2px;line-height:1.2;">TenderScope</div>
              <div style="color:#bfe0e8;font-size:11.5px;margin-top:2px;">Ελληνικό Παρατηρητήριο Δημοσίων Συμβάσεων</div>
            </td>
          </tr></table>
        </td></tr>
        <tr><td style="padding:24px 24px 0;">
          <div style="color:#16222c;font-size:16px;font-weight:800;margin-bottom:10px;">${items.length} ενημερώσεις σήμερα</div>
          <table role="presentation" cellpadding="0" cellspacing="0"><tr>
            ${stat(newItems.length, "νέοι", sectionAccents.new, sectionTints.new)}
            ${stat(submittedUpdates.length, "σε Υποβληθείσες", sectionAccents.submitted, sectionTints.submitted)}
            ${stat(interestedUpdates.length, "σε Ενδιαφέρον", sectionAccents.interested, sectionTints.interested)}
          </tr></table>
        </td></tr>
        ${renderSection("Νέοι διαγωνισμοί", "Ταιριάζουν στα CPV που παρακολουθείς.", newItems, sectionAccents.new)}
        ${renderSection("Ενημερώσεις σε προσφορές που έχουμε υποβάλει", "Παράταση/μετάθεση ή κατακύρωση σε διαγωνισμό που έχει σημανθεί ως Υποβληθείσα.", submittedUpdates, sectionAccents.submitted)}
        ${renderSection("Ενημερώσεις σε διαγωνισμούς που μας ενδιαφέρουν", "Παράταση/μετάθεση ή κατακύρωση σε διαγωνισμό που έχει σημανθεί ως Ενδιαφέρον.", interestedUpdates, sectionAccents.interested)}
        <tr><td style="padding:28px 24px 24px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f9fa;border-radius:12px;">
            <tr><td style="padding:18px 20px;text-align:center;">
              <a href="${appUrl}" style="display:inline-block;background:#168c8c;color:#ffffff;font-size:12.5px;font-weight:700;text-decoration:none;padding:10px 22px;border-radius:8px;margin-bottom:10px;">Άνοιγμα στο TenderScope</a>
              <div style="color:#8a97a0;font-size:10.5px;line-height:1.5;margin-top:4px;">Αναζήτησε τον κωδικό ΑΔΑΜ μέσα στην εφαρμογή για τα πλήρη στοιχεία.<br/>Για να σταματήσεις αυτές τις ειδοποιήσεις, αφαίρεσε το email σου από τη σελίδα Ειδοποιήσεις.</div>
            </td></tr>
          </table>
        </td></tr>
      </table>
    </td></tr>
  </table>`;
}

// TEMP diagnostic branch to visually verify the redesign. Remove once
// confirmed looking right.
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
      contractors: null,
    },
    {
      adam: "26PROC019648814",
      title: "ΠΡΟΣΚΛΗΣΗ ΥΠΟΒΟΛΗΣ ΠΡΟΣΦΟΡΑΣ ΓΙΑ ΥΠΗΡΕΣΙΕΣ ΔΙΑΣΥΝΔΕΣΗΣ ΣΥΣΤΗΜΑΤΩΝ ΚΟΙΝΟΧΡΗΣΤΩΝ ΠΟΔΗΛΑΤΩΝ",
      authority: "ΔΗΜΟΣ ΚΕΡΑΤΣΙΝΙΟΥ - ΔΡΑΠΕΤΣΩΝΑΣ",
      documentType: "announcement",
      publicationDate: "2026-08-19",
      openingDate: "2026-08-28T14:00:00+00:00",
      budget: 5580,
      description: "Υπηρεσίες τεχνικής υποστήριξης",
      isSubmitted: false,
      isInterested: false,
      contractors: null,
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
      contractors: null,
    },
    {
      adam: "26AWRD018634540",
      title: "Κατακύρωση διαγ. Μελέτης: ΠΑΡΕΜΒΑΣΕΙΣ ΑΣΤΙΚΗΣ ΑΝΑΖΩΟΓΟΝΗΣΗΣ ΣΤΗΝ ΚΟΙΝΟΤΗΤΑ ΣΙΝΔΟΥ ΔΗΜΟΥ ΔΕΛΤΑ",
      authority: "ΑΝΑΠΤΥΞΙΑΚΗ ΝΟΜΟΥ ΘΕΣΣΑΛΟΝΙΚΗΣ ΑΕ",
      documentType: "award",
      publicationDate: "2026-08-19",
      openingDate: null,
      budget: 448477,
      description: null,
      isSubmitted: true,
      isInterested: false,
      contractors: "Φ. ΦΑΣΟΥΛΑΣ - Ν. ΜΑΝΤΖΙΟΣ Ε.Ε., ΔΙΚΤΥΟ - ΑΝΩΝΥΜΗ ΕΤΑΙΡΙΑ ΤΕΧΝΙΚΩΝ ΜΕΛΕΤΩΝ",
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
      contractors: null,
    },
  ];
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: [to],
      subject: "[TEST] Νέο design - TenderScope",
      html: buildEmailHtml(sample),
    }),
  });
  return response.ok;
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
