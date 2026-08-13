import { NextResponse } from "next/server";
import { procurementAdamsForCpv, relatedRows, supabaseGet } from "@/lib/matching";

export const dynamic = "force-dynamic";

const ALERT_WINDOW_DAYS = 45;

type WatchlistRow = { cpv_code: string; cpv_label: string | null };
type ProcurementRow = {
  adam: string;
  title: string;
  authority_name: string | null;
  contract_type: string | null;
  document_category: string | null;
  publication_date: string | null;
  opening_at: string | null;
  budget_ex_vat: number | null;
  budget_inc_vat: number | null;
  budget_unknown_vat: number | null;
};
type CpvRow = { record_type: string; record_adam: string; cpv_code: string; cpv_description: string | null };

function money(row: ProcurementRow) {
  return Number(row.budget_inc_vat ?? row.budget_ex_vat ?? row.budget_unknown_vat ?? 0);
}

export async function GET() {
  try {
    const watchlist = await supabaseGet<WatchlistRow[]>("cpv_watchlist?select=cpv_code,cpv_label&order=created_at.desc");
    if (!watchlist.length) return NextResponse.json({ watchlist, alerts: [] });

    // "Which watched CPV(s) matched" per tender - the same tender can
    // legitimately match more than one watched code.
    const matchesByCpv = await Promise.all(watchlist.map((item) => procurementAdamsForCpv(item.cpv_code)));
    const watchedCpvByAdam = new Map<string, string[]>();
    watchlist.forEach((item, index) => {
      for (const adam of matchesByCpv[index].procurementAdams) {
        watchedCpvByAdam.set(adam, [...(watchedCpvByAdam.get(adam) ?? []), item.cpv_code]);
      }
    });
    const candidateAdams = [...watchedCpvByAdam.keys()];
    if (!candidateAdams.length) return NextResponse.json({ watchlist, alerts: [] });

    const cutoff = new Date(Date.now() - ALERT_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const notices = await relatedRows<ProcurementRow>(
      "procurements_compact", "adam", candidateAdams,
      "adam,title,authority_name,contract_type,document_category,publication_date,opening_at,budget_ex_vat,budget_inc_vat,budget_unknown_vat",
      // Only original declarations/announcements published recently count as
      // a "new tender" alert - a decision or amendment on an older tender
      // matching the same CPV isn't a new opportunity.
      `document_category=in.(declaration,announcement)&publication_date=gte.${cutoff}`,
    );

    const noticeCpvs = notices.length
      ? await relatedRows<CpvRow>(
          "record_cpvs_compact", "record_adam", notices.map((row) => row.adam),
          "record_type,record_adam,cpv_code,cpv_description", "record_type=eq.procurement",
        )
      : [];
    const cpvsByAdam = new Map<string, CpvRow[]>();
    for (const row of noticeCpvs) cpvsByAdam.set(row.record_adam, [...(cpvsByAdam.get(row.record_adam) ?? []), row]);

    const alerts = notices
      .map((notice) => ({
        adam: notice.adam,
        title: notice.title,
        authority: notice.authority_name ?? "—",
        contractType: notice.contract_type ?? undefined,
        publicationDate: notice.publication_date,
        openingDate: notice.opening_at,
        budget: money(notice),
        matchedCpv: watchedCpvByAdam.get(notice.adam) ?? [],
        cpvs: (cpvsByAdam.get(notice.adam) ?? []).map((row) => ({ code: row.cpv_code, description: row.cpv_description })),
      }))
      .sort((a, b) => (b.publicationDate ?? "").localeCompare(a.publicationDate ?? ""));

    return NextResponse.json({ watchlist, alerts });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown alerts error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
