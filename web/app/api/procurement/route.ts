import { NextResponse } from "next/server";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

type DbRecord = Record<string, string | number | boolean | null>;
type CpvRow = { reference_number: string; cpv_code: string; cpv_description: string | null };

const MAX_ROWS = 1000;
export const dynamic = "force-dynamic";

async function supabaseGet(path: string) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Supabase environment variables are missing");

  const response = await fetch(`${url}/rest/v1/${path}`, {
    headers: { apikey: key, Prefer: "count=exact" },
    next: { revalidate: 300 },
  });
  if (!response.ok) throw new Error(`Supabase request failed (${response.status})`);
  return response.json();
}

async function cpvsFor(sourceType: "notice" | "auction", references: string[]) {
  const rows: CpvRow[] = [];
  for (let index = 0; index < references.length; index += 80) {
    const chunk = references.slice(index, index + 80).map(encodeURIComponent).join(",");
    const result = await supabaseGet(
      `cpv_items?select=reference_number,cpv_code,cpv_description&source_type=eq.${sourceType}&reference_number=in.(${chunk})`,
    );
    rows.push(...result);
  }
  return new Map(rows.map((row) => [row.reference_number, row]));
}

function statusFor(row: DbRecord) {
  if (row.cancel_date) return "Ακυρωμένος";
  const value = String(row.status ?? "").toLocaleLowerCase("el");
  if (value.includes("complete") || value.includes("ολοκληρ")) return "Ολοκληρωμένος";
  if (value.includes("award") || value.includes("ανατεθ")) return "Ανατεθειμένος";
  if (value.includes("evaluat") || value.includes("αξιολόγ")) return "Αξιολόγηση";
  return "Ενεργός";
}

export async function GET() {
  try {
    // The curated Excel snapshot keeps the preview usable while the Supabase
    // project is unavailable. Re-running the extractor refreshes this file.
    const snapshotPath = path.join(process.cwd(), "data", "excel");
    const filenames = (await readdir(snapshotPath)).filter((name) => name.endsWith(".json")).sort();
    const chunks = await Promise.all(
      filenames.map(async (name) => JSON.parse(await readFile(path.join(snapshotPath, name), "utf8"))),
    );
    const snapshot = {
      tenders: chunks.flatMap((chunk) => chunk.tenders ?? []),
      awards: chunks.flatMap((chunk) => chunk.awards ?? []),
      meta: {
        source: "Master-File_06082026.xlsx",
        year: 2024,
        chunkCount: chunks.length,
      },
    };
    return NextResponse.json(snapshot, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (snapshotError) {
    console.warn("Excel snapshot unavailable; falling back to Supabase", snapshotError);
  }

  try {
    const [notices, auctions] = await Promise.all([
      supabaseGet(`notices?select=id,reference_number,title,organization_name,contract_type,publication_date,final_submission_date,opening_date,total_cost,status,cancel_date&order=publication_date.desc.nullslast&limit=${MAX_ROWS}`),
      supabaseGet(`auctions?select=id,reference_number,notice_reference_number,title,organization_name,contract_type,award_date,total_cost,contractor_name,contractor_vat,cancel_date&order=award_date.desc.nullslast&limit=${MAX_ROWS}`),
    ]);

    const [noticeCpvs, auctionCpvs] = await Promise.all([
      cpvsFor("notice", notices.map((row: DbRecord) => String(row.reference_number))),
      cpvsFor("auction", auctions.map((row: DbRecord) => String(row.reference_number))),
    ]);

    return NextResponse.json({
      tenders: notices.map((row: DbRecord) => {
        const cpv = noticeCpvs.get(String(row.reference_number));
        return {
          adam: row.reference_number,
          title: row.title,
          authority: row.organization_name,
          contractType: row.contract_type,
          cpv: cpv?.cpv_code ?? "—",
          cpvDescription: cpv?.cpv_description ?? "",
          status: statusFor(row),
          publicationDate: row.publication_date,
          deadline: row.final_submission_date,
          openingDate: row.opening_date,
          budget: Number(row.total_cost ?? 0),
        };
      }),
      awards: auctions.map((row: DbRecord) => {
        const cpv = auctionCpvs.get(String(row.reference_number));
        return {
          adam: row.reference_number,
          noticeAdam: row.notice_reference_number,
          title: row.title,
          authority: row.organization_name,
          contractType: row.contract_type,
          cpv: cpv?.cpv_code ?? "—",
          cpvDescription: cpv?.cpv_description ?? "",
          awardDate: row.award_date,
          value: Number(row.total_cost ?? 0),
          contractor: row.contractor_name ?? "Χωρίς ανάδοχο",
          contractorVat: row.contractor_vat,
        };
      }),
      meta: { source: "Supabase", limitPerSource: MAX_ROWS },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown data error" },
      { status: 500 },
    );
  }
}

