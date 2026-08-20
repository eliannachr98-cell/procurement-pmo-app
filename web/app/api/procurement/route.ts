import { NextResponse } from "next/server";
import {
  allRows,
  intersect,
  procurementAdamsForContractor,
  procurementAdamsForCpv,
  relatedRows,
  supabaseGet,
  union,
} from "@/lib/matching";

type ProcurementRow = {
  adam: string;
  title: string;
  authority_name: string | null;
  contract_type: string | null;
  procedure_type: string | null;
  document_category: string | null;
  nuts_code: string | null;
  nuts_name: string | null;
  publication_date: string | null;
  opening_at: string | null;
  budget_ex_vat: number | null;
  budget_inc_vat: number | null;
  budget_unknown_vat: number | null;
  status: string | null;
  cancelled_at: string | null;
};

type AwardRow = {
  adam: string;
  procurement_adam: string | null;
  title: string | null;
  authority_name: string | null;
  contract_type: string | null;
  award_date: string | null;
  amount_ex_vat: number | null;
  amount_inc_vat: number | null;
  amount_unknown_vat: number | null;
};

type ContractRow = {
  adam: string;
  procurement_adam: string | null;
  award_adam: string | null;
  title: string | null;
  authority_name: string | null;
  contract_type: string | null;
  signed_date: string | null;
  delivery_date: string | null;
  amount_ex_vat: number | null;
  amount_inc_vat: number | null;
  amount_unknown_vat: number | null;
};

type CpvRow = {
  record_type: "procurement" | "award" | "contract";
  record_adam: string;
  cpv_code: string;
  cpv_description: string | null;
};

type ContractorRow = {
  record_type: "award" | "contract";
  record_adam: string;
  position: number;
  contractor_name: string;
  contractor_vat: string | null;
};

const DEFAULT_PAGE_SIZE = 500;
const MAX_PAGE_SIZE = 1000;
// Preview reads live compact rows while the historical backfill continues.
export const dynamic = "force-dynamic";

function money(row: {
  amount_inc_vat?: number | null;
  amount_ex_vat?: number | null;
  amount_unknown_vat?: number | null;
  budget_inc_vat?: number | null;
  budget_ex_vat?: number | null;
  budget_unknown_vat?: number | null;
}) {
  return Number(
    row.amount_inc_vat ?? row.amount_ex_vat ?? row.amount_unknown_vat ??
    row.budget_inc_vat ?? row.budget_ex_vat ?? row.budget_unknown_vat ?? 0,
  );
}

async function supabasePage<T>(path: string): Promise<{ rows: T; total: number }> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Supabase environment variables are missing");

  const response = await fetch(`${url}/rest/v1/${path}`, {
    // No Prefer: count=... header on purpose. Any count preference (even
    // "planned", tried after "exact" started timing out on the full
    // backfilled table) makes PostgREST validate the requested offset
    // against that count and reject with 416/PGRST103 "range not
    // satisfiable" once offset exceeds it - confirmed live: a planned
    // estimate of 37 for a broad authority ILIKE filter blocked every page
    // past the first even though 234+ rows actually matched. Without a
    // count preference, limit/offset just apply directly with no such
    // check, and the accurate total for display comes from
    // /api/dashboard's real SQL count instead of this endpoint's own.
    headers: { apikey: key },
    cache: "no-store",
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Supabase request failed (${response.status}): ${detail.slice(0, 180)}`);
  }
  const contentRange = response.headers.get("content-range") ?? "";
  const total = Number(contentRange.split("/")[1] ?? 0);
  return { rows: await response.json(), total: Number.isFinite(total) ? total : 0 };
}

function groupBy<T>(rows: T[], key: (row: T) => string | null) {
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    const value = key(row);
    if (!value) continue;
    grouped.set(value, [...(grouped.get(value) ?? []), row]);
  }
  return grouped;
}

function statusFor(row: ProcurementRow, awards: AwardRow[], contracts: ContractRow[], validOpeningAt?: string) {
  if (row.cancelled_at || row.status === "cancelled") return "Ακυρωμένος";
  if (contracts.length) return "Ολοκληρωμένος";
  if (awards.length) return "Ανατεθειμένος";
  // Must use the same validated opening date as the display value below -
  // a raw opening_at earlier than publication_date is bad source data, not
  // a real passed deadline, and was otherwise pushing those notices into
  // "Αξιολόγηση" while the UI simultaneously showed no deadline at all.
  if (validOpeningAt && new Date(validOpeningAt).getTime() < Date.now()) return "Αξιολόγηση";
  return "Ενεργός";
}

export async function GET(request: Request) {
  try {
    const searchParams = new URL(request.url).searchParams;
    const page = Math.max(1, Number(searchParams.get("page") ?? 1) || 1);
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(50, Number(searchParams.get("pageSize") ?? DEFAULT_PAGE_SIZE) || DEFAULT_PAGE_SIZE));
    const offset = (page - 1) * pageSize;
    const query = searchParams.get("q")?.trim() ?? "";
    const authority = searchParams.get("authority")?.trim() ?? "";
    const contractors = searchParams.getAll("contractor").flatMap((value) => value.split(",")).map((value) => value.trim()).filter(Boolean);
    const cpvs = searchParams.getAll("cpv").flatMap((value) => value.split(",")).map((value) => value.trim()).filter(Boolean);
    const year = searchParams.get("year")?.trim() ?? "";
    const contractTypes = searchParams.getAll("contractType").flatMap((value) => value.split(",")).map((value) => value.trim()).filter(Boolean);
    const documentType = searchParams.get("documentType")?.trim() ?? "";

    let matchingAdams: string[] | null = null;
    let matchingAwardAdams: string[] | null = null;
    let matchingContractAdams: string[] | null = null;
    if (contractors.length) {
      const groups: Awaited<ReturnType<typeof procurementAdamsForContractor>>[] = [];
      for (const item of contractors) groups.push(await procurementAdamsForContractor(item));
      matchingAdams = intersect(matchingAdams, union(groups.map((item) => item.procurementAdams)));
      matchingAwardAdams = intersect(matchingAwardAdams, union(groups.map((item) => item.awardAdams)));
      matchingContractAdams = intersect(matchingContractAdams, union(groups.map((item) => item.contractAdams)));
    }
    if (cpvs.length) {
      const groups: Awaited<ReturnType<typeof procurementAdamsForCpv>>[] = [];
      for (const item of cpvs) groups.push(await procurementAdamsForCpv(item));
      matchingAdams = intersect(matchingAdams, union(groups.map((item) => item.procurementAdams)));
      matchingAwardAdams = intersect(matchingAwardAdams, union(groups.map((item) => item.awardAdams)));
      matchingContractAdams = intersect(matchingContractAdams, union(groups.map((item) => item.contractAdams)));
    }

    if (matchingAdams?.length === 0) {
      return NextResponse.json({ tenders: [], awards: [], contracts: [], meta: { source: "Supabase compact", page, pageSize, total: 0, hasMore: false, loadedAt: new Date().toISOString() } });
    }

    const filters: string[] = [];
    if (query) {
      const value = encodeURIComponent(`*${query}*`);
      filters.push(`or=(adam.ilike.${value},title.ilike.${value})`);
    }
    if (authority) filters.push(`authority_name=ilike.${encodeURIComponent(`*${authority}*`)}`);
    if (/^\d{4}$/.test(year)) {
      filters.push(`publication_date=gte.${year}-01-01`, `publication_date=lte.${year}-12-31`);
    }
    if (contractTypes.length) filters.push(`contract_type=in.(${contractTypes.map(encodeURIComponent).join(",")})`);
    if (documentType) filters.push(`document_category=eq.${encodeURIComponent(documentType)}`);
    if (matchingAdams) filters.push(`adam=in.(${matchingAdams.map(encodeURIComponent).join(",")})`);

    const noticePage = await supabasePage<ProcurementRow[]>(
      "procurements_compact?select=adam,title,authority_name,contract_type,procedure_type,document_category,nuts_code,nuts_name,publication_date,opening_at,budget_ex_vat,budget_inc_vat,budget_unknown_vat,status,cancelled_at" +
      (filters.length ? `&${filters.join("&")}` : "") +
      `&order=publication_date.desc.nullslast&limit=${pageSize}&offset=${offset}`,
    );
    const notices = noticePage.rows;
    const noticeAdams = notices.map((row) => row.adam);

    const [awards, contracts, noticeCpvs] = await Promise.all([
      relatedRows<AwardRow>(
        "awards_compact", "procurement_adam", noticeAdams,
        "adam,procurement_adam,title,authority_name,contract_type,award_date,amount_ex_vat,amount_inc_vat,amount_unknown_vat",
      ),
      relatedRows<ContractRow>(
        "contracts_compact", "procurement_adam", noticeAdams,
        "adam,procurement_adam,award_adam,title,authority_name,contract_type,signed_date,delivery_date,amount_ex_vat,amount_inc_vat,amount_unknown_vat",
      ),
      relatedRows<CpvRow>(
        "record_cpvs_compact", "record_adam", noticeAdams,
        "record_type,record_adam,cpv_code,cpv_description",
        "record_type=eq.procurement",
      ),
    ]);

    // A contract's own procurement_adam is often unset - it's still linked to
    // the notice through its award (same gap already handled for the market
    // section below). Missing this made a completed tender (with a real
    // signed contract) show as merely "Ανατεθειμένος" - confirmed live
    // against actual contract rows, e.g. 26PROC019515568.
    const awardAdams = awards.map((row) => row.adam);
    if (awardAdams.length) {
      const supplementalContracts = await relatedRows<ContractRow>(
        "contracts_compact", "award_adam", awardAdams,
        "adam,procurement_adam,award_adam,title,authority_name,contract_type,signed_date,delivery_date,amount_ex_vat,amount_inc_vat,amount_unknown_vat",
      );
      const seenContractAdams = new Set(contracts.map((row) => row.adam));
      const awardsByAdam = new Map(awards.map((row) => [row.adam, row]));
      for (const row of supplementalContracts) {
        if (seenContractAdams.has(row.adam)) continue;
        contracts.push({ ...row, procurement_adam: row.procurement_adam ?? awardsByAdam.get(row.award_adam ?? "")?.procurement_adam ?? null });
        seenContractAdams.add(row.adam);
      }
    }
    const contractAdams = contracts.map((row) => row.adam);
    const [awardCpvs, awardContractors, contractContractors] = await Promise.all([
      relatedRows<CpvRow>(
        "record_cpvs_compact", "record_adam", awardAdams,
        "record_type,record_adam,cpv_code,cpv_description",
        "record_type=eq.award",
      ),
      relatedRows<ContractorRow>(
        "record_contractors_compact", "record_adam", awardAdams,
        "record_type,record_adam,position,contractor_name,contractor_vat",
        "record_type=eq.award",
      ),
      relatedRows<ContractorRow>(
        "record_contractors_compact", "record_adam", contractAdams,
        "record_type,record_adam,position,contractor_name,contractor_vat",
        "record_type=eq.contract",
      ),
    ]);

    // Competition mapping must not depend on the currently visible tender page.
    // Recent tenders usually have no award yet, which previously made this view empty.
    // Authority/ADAM narrowing applies directly on these tables too, since a
    // contractor/CPV match isn't the only way into this view any more.
    // Year and document-type only exist on the notice itself, not on the
    // award/contract row, so narrowing by them means finding which notices
    // qualify first, then restricting the market rows to that notice set.
    const marketNoticeScopeFilters: string[] = [];
    if (/^\d{4}$/.test(year)) {
      marketNoticeScopeFilters.push(`publication_date=gte.${year}-01-01`, `publication_date=lte.${year}-12-31`);
    }
    if (documentType) marketNoticeScopeFilters.push(`document_category=eq.${encodeURIComponent(documentType)}`);
    let marketScopeAdams: string[] | null = null;
    if (marketNoticeScopeFilters.length) {
      // When a contractor/CPV match already narrowed the candidate notices,
      // check the year/document-type condition against exactly that set -
      // otherwise this would need to page through the entire (100k+ row)
      // table without any guarantee the relevant notices land in the cap.
      const scopeConstraint = matchingAdams ? `&adam=in.(${matchingAdams.map(encodeURIComponent).join(",")})` : "";
      const scopeRows = await supabaseGet<{ adam: string }[]>(
        `procurements_compact?select=adam&${marketNoticeScopeFilters.join("&")}${scopeConstraint}&order=publication_date.desc.nullslast&limit=5000`,
      );
      marketScopeAdams = scopeRows.map((row) => row.adam);
    }
    // An empty (but non-null) scope means the year/document-type combination
    // matches no notice at all - skip the fetch rather than send `in.()`,
    // whose empty-list behaviour PostgREST doesn't guarantee.
    const marketScopeIsEmpty = marketScopeAdams !== null && marketScopeAdams.length === 0;
    const marketExtraFilters: string[] = [];
    if (authority) marketExtraFilters.push(`authority_name=ilike.${encodeURIComponent(`*${authority}*`)}`);
    if (contractTypes.length) marketExtraFilters.push(`contract_type=in.(${contractTypes.map(encodeURIComponent).join(",")})`);
    if (marketScopeAdams?.length) marketExtraFilters.push(`procurement_adam=in.(${marketScopeAdams.map(encodeURIComponent).join(",")})`);
    if (query) {
      const value = encodeURIComponent(`*${query}*`);
      marketExtraFilters.push(`or=(procurement_adam.ilike.${value},adam.ilike.${value},title.ilike.${value})`);
    }
    const marketExtraQuery = marketExtraFilters.map((item) => `&${item}`).join("");
    const marketIsNarrowed = Boolean(matchingAwardAdams || matchingContractAdams || marketExtraFilters.length);
    const [marketAwards, marketContracts] = marketScopeIsEmpty ? [[] as AwardRow[], [] as ContractRow[]] : await Promise.all([
      supabaseGet<AwardRow[]>(
        "awards_compact?select=adam,procurement_adam,title,authority_name,contract_type,award_date,amount_ex_vat,amount_inc_vat,amount_unknown_vat" +
        (matchingAwardAdams ? `&adam=in.(${matchingAwardAdams.map(encodeURIComponent).join(",")})` : "") +
        marketExtraQuery +
        // `adam` is the primary key, so this avoids sorting the full awards table
        // by an unindexed date on every dashboard request.
        `&order=adam.desc&limit=${marketIsNarrowed ? 1000 : 200}`,
      ),
      supabaseGet<ContractRow[]>(
        "contracts_compact?select=adam,procurement_adam,award_adam,title,authority_name,contract_type,signed_date,delivery_date,amount_ex_vat,amount_inc_vat,amount_unknown_vat" +
        (matchingContractAdams ? `&adam=in.(${matchingContractAdams.map(encodeURIComponent).join(",")})` : "") +
        marketExtraQuery +
        `&order=adam.desc&limit=${marketIsNarrowed ? 1000 : 200}`,
      ),
    ]);
    // A contract's own procurement_adam is often unset - it's still linked to
    // the notice through its award. The scope filter above only matches a
    // contract's *own* procurement_adam, so it silently drops every contract
    // reachable only via award_adam - fetch those separately and merge in.
    if (marketScopeAdams && marketAwards.length) {
      const scopedAwardAdams = marketAwards.map((row) => row.adam);
      const supplementalFilters = [`award_adam=in.(${scopedAwardAdams.map(encodeURIComponent).join(",")})`];
      if (matchingContractAdams) supplementalFilters.push(`adam=in.(${matchingContractAdams.map(encodeURIComponent).join(",")})`);
      if (authority) supplementalFilters.push(`authority_name=ilike.${encodeURIComponent(`*${authority}*`)}`);
      if (contractTypes.length) supplementalFilters.push(`contract_type=in.(${contractTypes.map(encodeURIComponent).join(",")})`);
      const supplementalContracts = await supabaseGet<ContractRow[]>(
        "contracts_compact?select=adam,procurement_adam,award_adam,title,authority_name,contract_type,signed_date,delivery_date,amount_ex_vat,amount_inc_vat,amount_unknown_vat" +
        `&${supplementalFilters.join("&")}&order=adam.desc&limit=1000`,
      );
      const seenContractAdams = new Set(marketContracts.map((row) => row.adam));
      for (const row of supplementalContracts) {
        if (!seenContractAdams.has(row.adam)) { marketContracts.push(row); seenContractAdams.add(row.adam); }
      }
    }
    const marketAwardAdams = marketAwards.map((row) => row.adam);
    const marketContractAdams = marketContracts.map((row) => row.adam);
    const marketNoticeAdams = [...new Set([
      ...marketAwards.map((row) => row.procurement_adam),
      ...marketContracts.map((row) => row.procurement_adam),
    ].filter((value): value is string => Boolean(value)))];
    const [marketAwardCpvs, marketContractCpvs, marketNoticeCpvs, marketAwardContractors, marketContractContractors, marketNotices] = await Promise.all([
      relatedRows<CpvRow>(
        "record_cpvs_compact", "record_adam", marketAwardAdams,
        "record_type,record_adam,cpv_code,cpv_description",
        "record_type=eq.award",
      ),
      relatedRows<CpvRow>(
        "record_cpvs_compact", "record_adam", marketContractAdams,
        "record_type,record_adam,cpv_code,cpv_description",
        "record_type=eq.contract",
      ),
      relatedRows<CpvRow>(
        "record_cpvs_compact", "record_adam", marketNoticeAdams,
        "record_type,record_adam,cpv_code,cpv_description",
        "record_type=eq.procurement",
      ),
      relatedRows<ContractorRow>(
        "record_contractors_compact", "record_adam", marketAwardAdams,
        "record_type,record_adam,position,contractor_name,contractor_vat",
        "record_type=eq.award",
      ),
      relatedRows<ContractorRow>(
        "record_contractors_compact", "record_adam", marketContractAdams,
        "record_type,record_adam,position,contractor_name,contractor_vat",
        "record_type=eq.contract",
      ),
      relatedRows<ProcurementRow>(
        "procurements_compact", "adam", marketNoticeAdams,
        "adam,title,authority_name,contract_type",
      ),
    ]);

    const awardsByNotice = groupBy(awards, (row) => row.procurement_adam);
    const contractsByNotice = groupBy(contracts, (row) => row.procurement_adam);
    const noticeCpvsByAdam = groupBy(
      noticeCpvs.filter((row) => row.record_type === "procurement"),
      (row) => row.record_adam,
    );
    const awardCpvsByAdam = groupBy(
      awardCpvs.filter((row) => row.record_type === "award"),
      (row) => row.record_adam,
    );
    const awardContractorsByAdam = groupBy(
      awardContractors.filter((row) => row.record_type === "award"),
      (row) => row.record_adam,
    );
    const contractContractorsByAdam = groupBy(
      contractContractors.filter((row) => row.record_type === "contract"),
      (row) => row.record_adam,
    );
    const marketAwardCpvsByAdam = groupBy(
      marketAwardCpvs.filter((row) => row.record_type === "award"),
      (row) => row.record_adam,
    );
    const marketNoticeCpvsByAdam = groupBy(
      marketNoticeCpvs.filter((row) => row.record_type === "procurement"),
      (row) => row.record_adam,
    );
    const marketAwardContractorsByAdam = groupBy(
      marketAwardContractors.filter((row) => row.record_type === "award"),
      (row) => row.record_adam,
    );
    const marketContractCpvsByAdam = groupBy(
      marketContractCpvs.filter((row) => row.record_type === "contract"),
      (row) => row.record_adam,
    );
    const marketContractContractorsByAdam = groupBy(
      marketContractContractors.filter((row) => row.record_type === "contract"),
      (row) => row.record_adam,
    );
    const marketNoticesByAdam = new Map(marketNotices.map((row) => [row.adam, row]));
    const marketAwardsByAdam = new Map(marketAwards.map((row) => [row.adam, row]));

    const tenders = notices.map((notice) => {
      const linkedAwards = awardsByNotice.get(notice.adam) ?? [];
      const linkedContracts = contractsByNotice.get(notice.adam) ?? [];
      const cpv = noticeCpvsByAdam.get(notice.adam)?.[0];
      const contractorNames = [
        ...linkedAwards.flatMap((award) => awardContractorsByAdam.get(award.adam) ?? []),
        ...linkedContracts.flatMap((contract) => contractContractorsByAdam.get(contract.adam) ?? []),
      ].map((row) => row.contractor_name);
      const submissionDeadline = notice.opening_at && notice.publication_date &&
        notice.opening_at.slice(0, 10) < notice.publication_date
        ? undefined
        : notice.opening_at ?? undefined;

      return {
        adam: notice.adam,
        title: notice.title,
        authority: notice.authority_name ?? "—",
        cpv: cpv?.cpv_code ?? "—",
        cpvDescription: cpv?.cpv_description ?? "",
        contractType: notice.contract_type ?? undefined,
        procedureType: notice.procedure_type ?? undefined,
        documentType: notice.document_category ?? undefined,
        nutsCode: notice.nuts_code ?? undefined,
        nutsName: notice.nuts_name ?? undefined,
        status: statusFor(notice, linkedAwards, linkedContracts, submissionDeadline),
        publicationDate: notice.publication_date,
        deadline: submissionDeadline,
        openingDate: submissionDeadline,
        awardDate: linkedAwards.map((row) => row.award_date).filter(Boolean).sort()[0],
        contractDates: linkedContracts.map((row) => row.signed_date).filter(Boolean),
        deliveryDates: linkedContracts.map((row) => row.delivery_date).filter(Boolean),
        contractors: [...new Set(contractorNames)],
        awardValue: linkedAwards.reduce((sum, row) => sum + money(row), 0),
        contractValue: linkedContracts.reduce((sum, row) => sum + money(row), 0),
        budget: money(notice),
      };
    });

    const awardItems = marketAwards.flatMap((award) => {
      const cpv = marketAwardCpvsByAdam.get(award.adam)?.[0];
      const contractorsForAward = marketAwardContractorsByAdam.get(award.adam) ?? [];
      const linkedNotice = marketNoticesByAdam.get(award.procurement_adam ?? "");
      const rows = contractorsForAward.length ? contractorsForAward : [null];
      return rows.map((contractor) => ({
        adam: award.adam,
        noticeAdam: award.procurement_adam ?? undefined,
        // `title` is this award document's own title (e.g. an award decision) -
        // `noticeTitle` is the actual tender/declaration it belongs to, which a
        // "which tenders has this contractor won" view needs instead.
        noticeTitle: linkedNotice?.title,
        title: award.title ?? linkedNotice?.title ?? "—",
        authority: award.authority_name ?? linkedNotice?.authority_name ?? "—",
        contractType: award.contract_type ?? linkedNotice?.contract_type ?? undefined,
        cpv: cpv?.cpv_code ?? marketNoticeCpvsByAdam.get(award.procurement_adam ?? "")?.[0]?.cpv_code ?? "—",
        cpvDescription: cpv?.cpv_description ?? marketNoticeCpvsByAdam.get(award.procurement_adam ?? "")?.[0]?.cpv_description ?? "",
        contractor: contractor?.contractor_name ?? "Χωρίς ανάδοχο",
        contractorVat: contractor?.contractor_vat ?? undefined,
        awardDate: award.award_date ?? undefined,
        value: money(award),
      }));
    });

    const contractItems = marketContracts.flatMap((contract) => {
      const cpv = marketContractCpvsByAdam.get(contract.adam)?.[0];
      const linkedAward = marketAwardsByAdam.get(contract.award_adam ?? "");
      // A contract's own procurement_adam is sometimes unset - fall back to
      // its linked award's, since that's still the same real tender.
      const noticeAdam = contract.procurement_adam ?? linkedAward?.procurement_adam ?? undefined;
      const linkedNotice = marketNoticesByAdam.get(noticeAdam ?? "");
      // A contract's own contractor rows sometimes aren't repeated from its
      // award -- fall back to the award's contractors when the contract has
      // none of its own.
      const contractorsForContract = marketContractContractorsByAdam.get(contract.adam)
        ?? (linkedAward ? marketAwardContractorsByAdam.get(linkedAward.adam) : undefined)
        ?? [];
      const rows = contractorsForContract.length ? contractorsForContract : [null];
      return rows.map((contractor) => ({
        adam: contract.adam,
        noticeAdam,
        noticeTitle: linkedNotice?.title,
        title: contract.title ?? linkedAward?.title ?? linkedNotice?.title ?? "—",
        authority: contract.authority_name ?? linkedAward?.authority_name ?? linkedNotice?.authority_name ?? "—",
        contractType: contract.contract_type ?? linkedAward?.contract_type ?? linkedNotice?.contract_type ?? undefined,
        cpv: cpv?.cpv_code ?? marketNoticeCpvsByAdam.get(noticeAdam ?? "")?.[0]?.cpv_code ?? "—",
        cpvDescription: cpv?.cpv_description ?? marketNoticeCpvsByAdam.get(noticeAdam ?? "")?.[0]?.cpv_description ?? "",
        contractor: contractor?.contractor_name ?? "Χωρίς ανάδοχο",
        contractorVat: contractor?.contractor_vat ?? undefined,
        signedDate: contract.signed_date ?? undefined,
        deliveryDate: contract.delivery_date ?? undefined,
        value: money(contract),
      }));
    });

    return NextResponse.json(
      {
        tenders,
        awards: awardItems,
        contracts: contractItems,
        meta: {
          source: "Supabase compact",
          page,
          pageSize,
          // No count preference is requested anymore (see supabasePage), so
          // there's no server-side total to report here - the client uses
          // /api/dashboard's accurate SQL count for display instead. A full
          // page back is itself the pagination signal: if there's more, the
          // next page will return some more rows; if not, an empty/partial
          // one ends it.
          total: offset + notices.length,
          hasMore: notices.length === pageSize,
          loadedAt: new Date().toISOString(),
        },
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown data error";
    console.error(`[procurement-api] ${message}`);
    return NextResponse.json(
      { error: message },
      { status: 500 },
    );
  }
}

