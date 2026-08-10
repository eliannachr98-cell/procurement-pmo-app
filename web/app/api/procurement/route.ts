import { NextResponse } from "next/server";

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
const CHUNK_SIZE = 70;
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

async function supabaseGet<T>(path: string): Promise<T> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Supabase environment variables are missing");

  const response = await fetch(`${url}/rest/v1/${path}`, {
    headers: { apikey: key },
    cache: "no-store",
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Supabase request failed (${response.status}): ${detail.slice(0, 180)}`);
  }
  return response.json();
}

async function supabasePage<T>(path: string): Promise<{ rows: T; total: number }> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Supabase environment variables are missing");

  const response = await fetch(`${url}/rest/v1/${path}`, {
    // An exact count scans the entire historical table and started timing out
    // once the full backfill was loaded. Planned count keeps pagination open
    // across the complete dataset without blocking every page request.
    headers: { apikey: key, Prefer: "count=planned" },
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

async function relatedRows<T>(table: string, column: string, values: string[], select: string, filter = "") {
  const unique = [...new Set(values.filter(Boolean))];
  const rows: T[] = [];
  for (let index = 0; index < unique.length; index += CHUNK_SIZE) {
    const chunk = unique.slice(index, index + CHUNK_SIZE).map(encodeURIComponent).join(",");
    rows.push(...await supabaseGet<T[]>(
      `${table}?select=${select}${filter ? `&${filter}` : ""}&${column}=in.(${chunk})`,
    ));
  }
  return rows;
}

async function allRows<T>(path: string) {
  const rows: T[] = [];
  const separator = path.includes("?") ? "&" : "?";
  for (let offset = 0; ; offset += 1000) {
    const page = await supabaseGet<T[]>(`${path}${separator}limit=1000&offset=${offset}`);
    rows.push(...page);
    if (page.length < 1000) return rows;
  }
}

function intersect(left: string[] | null, right: string[]) {
  if (left === null) return [...new Set(right)];
  const allowed = new Set(right);
  return left.filter((value) => allowed.has(value));
}

function union(groups: string[][]) {
  return [...new Set(groups.flat())];
}

async function procurementAdamsForContractor(term: string) {
  const value = encodeURIComponent(`*${term}*`);
  const contractors = await allRows<Pick<ContractorRow, "record_type" | "record_adam">>(
    `record_contractors_compact?select=record_type,record_adam&contractor_name=ilike.${value}`,
  );
  const awardAdams = contractors.filter((row) => row.record_type === "award").map((row) => row.record_adam);
  const contractAdams = contractors.filter((row) => row.record_type === "contract").map((row) => row.record_adam);
  const [linkedAwards, linkedContracts] = await Promise.all([
    relatedRows<Pick<AwardRow, "adam" | "procurement_adam">>(
      "awards_compact", "adam", awardAdams, "adam,procurement_adam",
    ),
    relatedRows<Pick<ContractRow, "adam" | "procurement_adam" | "award_adam">>(
      "contracts_compact", "adam", contractAdams, "adam,procurement_adam,award_adam",
    ),
  ]);
  return {
    procurementAdams: [...new Set([...linkedAwards, ...linkedContracts].map((row) => row.procurement_adam).filter((item): item is string => Boolean(item)))],
    awardAdams: [...new Set([...awardAdams, ...linkedContracts.map((row) => row.award_adam)].filter((item): item is string => Boolean(item)))],
  };
}

async function procurementAdamsForCpv(term: string) {
  const value = encodeURIComponent(`*${term}*`);
  const cpvFilter = /^\d{8}-\d$/.test(term)
    ? `cpv_code=eq.${encodeURIComponent(term)}`
    : `or=(cpv_code.ilike.${value},cpv_description.ilike.${value})`;
  const cpvs = await allRows<CpvRow>(
    `record_cpvs_compact?select=record_type,record_adam,cpv_code,cpv_description&${cpvFilter}`,
  );
  const direct = cpvs.filter((row) => row.record_type === "procurement").map((row) => row.record_adam);
  const awardAdams = cpvs.filter((row) => row.record_type === "award").map((row) => row.record_adam);
  const contractAdams = cpvs.filter((row) => row.record_type === "contract").map((row) => row.record_adam);
  const [linkedAwards, linkedContracts] = await Promise.all([
    relatedRows<Pick<AwardRow, "adam" | "procurement_adam">>(
      "awards_compact", "adam", awardAdams, "adam,procurement_adam",
    ),
    relatedRows<Pick<ContractRow, "adam" | "procurement_adam" | "award_adam">>(
      "contracts_compact", "adam", contractAdams, "adam,procurement_adam,award_adam",
    ),
  ]);
  return {
    procurementAdams: [...new Set([...direct, ...linkedAwards.map((row) => row.procurement_adam), ...linkedContracts.map((row) => row.procurement_adam)].filter((item): item is string => Boolean(item)))],
    awardAdams: [...new Set([...awardAdams, ...linkedContracts.map((row) => row.award_adam)].filter((item): item is string => Boolean(item)))],
  };
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

function statusFor(row: ProcurementRow, awards: AwardRow[], contracts: ContractRow[]) {
  if (row.cancelled_at || row.status === "cancelled") return "Ακυρωμένος";
  if (contracts.length) return "Ολοκληρωμένος";
  if (awards.length) return "Ανατεθειμένος";
  if (row.opening_at && new Date(row.opening_at).getTime() < Date.now()) return "Αξιολόγηση";
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
    const contractType = searchParams.get("contractType")?.trim() ?? "";
    const documentType = searchParams.get("documentType")?.trim() ?? "";

    let matchingAdams: string[] | null = null;
    let matchingAwardAdams: string[] | null = null;
    if (contractors.length) {
      const groups: Awaited<ReturnType<typeof procurementAdamsForContractor>>[] = [];
      for (const item of contractors) groups.push(await procurementAdamsForContractor(item));
      matchingAdams = intersect(matchingAdams, union(groups.map((item) => item.procurementAdams)));
      matchingAwardAdams = intersect(matchingAwardAdams, union(groups.map((item) => item.awardAdams)));
    }
    if (cpvs.length) {
      const groups: Awaited<ReturnType<typeof procurementAdamsForCpv>>[] = [];
      for (const item of cpvs) groups.push(await procurementAdamsForCpv(item));
      matchingAdams = intersect(matchingAdams, union(groups.map((item) => item.procurementAdams)));
      matchingAwardAdams = intersect(matchingAwardAdams, union(groups.map((item) => item.awardAdams)));
    }

    if (matchingAdams?.length === 0) {
      return NextResponse.json({ tenders: [], awards: [], meta: { source: "Supabase compact", page, pageSize, total: 0, hasMore: false, loadedAt: new Date().toISOString() } });
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
    if (contractType) filters.push(`contract_type=eq.${encodeURIComponent(contractType)}`);
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
        "adam,procurement_adam,award_adam,signed_date,delivery_date,amount_ex_vat,amount_inc_vat,amount_unknown_vat",
      ),
      relatedRows<CpvRow>(
        "record_cpvs_compact", "record_adam", noticeAdams,
        "record_type,record_adam,cpv_code,cpv_description",
        "record_type=eq.procurement",
      ),
    ]);

    const awardAdams = awards.map((row) => row.adam);
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
    const marketAwards = await supabaseGet<AwardRow[]>(
      "awards_compact?select=adam,procurement_adam,title,authority_name,contract_type,award_date,amount_ex_vat,amount_inc_vat,amount_unknown_vat" +
      (matchingAwardAdams ? `&adam=in.(${matchingAwardAdams.map(encodeURIComponent).join(",")})` : "") +
      // `adam` is the primary key, so this avoids sorting the full awards table
      // by an unindexed date on every dashboard request.
      `&order=adam.desc&limit=${matchingAwardAdams ? 1000 : 200}`,
    );
    const marketAwardAdams = marketAwards.map((row) => row.adam);
    const marketNoticeAdams = marketAwards.map((row) => row.procurement_adam).filter((value): value is string => Boolean(value));
    const [marketAwardCpvs, marketNoticeCpvs, marketAwardContractors, marketNotices] = await Promise.all([
      relatedRows<CpvRow>(
        "record_cpvs_compact", "record_adam", marketAwardAdams,
        "record_type,record_adam,cpv_code,cpv_description",
        "record_type=eq.award",
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
    const marketNoticesByAdam = new Map(marketNotices.map((row) => [row.adam, row]));

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
        status: statusFor(notice, linkedAwards, linkedContracts),
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

    return NextResponse.json(
      {
        tenders,
        awards: awardItems,
        meta: {
          source: "Supabase compact",
          page,
          pageSize,
          total: noticePage.total,
          hasMore: offset + notices.length < noticePage.total,
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

