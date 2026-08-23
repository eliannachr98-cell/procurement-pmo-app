// Shared between the daily cron (api/cron/send-alerts) and the "send a
// catch-up email right when someone registers" path (api/alert-recipients)
// so the two never drift into two different-looking emails.
import { supabaseWrite } from "@/lib/matching";

export type CandidateRow = {
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
export function buildEmailHtml(items: CandidateRow[]) {
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

// Sends one recipient's catch-up/daily email and records what was sent -
// only on confirmed Resend success, same as the cron loop always did, so a
// transient failure retries with the same items next time instead of
// silently dropping them. Shared by the daily cron and the
// send-immediately-on-registration path below.
export async function sendAlertEmailToRecipient(email: string, candidates: CandidateRow[], apiKey: string, from: string): Promise<boolean> {
  if (!candidates.length) return false;
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
    await supabaseWrite(
      "alert_notifications_sent",
      "POST",
      candidates.map((item) => ({ recipient_email: email, adam: item.adam })),
      "return=minimal,resolution=merge-duplicates",
    );
    return true;
  } catch {
    return false;
  }
}
