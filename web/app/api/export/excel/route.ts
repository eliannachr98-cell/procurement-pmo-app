import { NextResponse } from "next/server";
import ExcelJS from "exceljs";

export const dynamic = "force-dynamic";

// Greek filenames need the RFC 5987 filename* form - plain ASCII filename=
// stays as a fallback for the rare client that doesn't parse it.
function contentDisposition(filename: string) {
  const ascii = filename.replace(/[^\x20-\x7E]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

type ExportBody = {
  filename: string;
  headers: string[];
  rows: (string | number)[][];
  chartImage?: { dataUrl: string; width: number; height: number };
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ExportBody;
    const workbook = new ExcelJS.Workbook();

    const sheet = workbook.addWorksheet("Δεδομένα");
    sheet.addRow(body.headers);
    sheet.getRow(1).font = { bold: true };
    sheet.getRow(1).eachCell((cell) => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFF3F5" } };
    });
    for (const row of body.rows) sheet.addRow(row);
    sheet.columns.forEach((column) => {
      let maxLength = 10;
      column.eachCell?.((cell) => { maxLength = Math.max(maxLength, String(cell.value ?? "").length); });
      column.width = Math.min(60, maxLength + 2);
    });

    if (body.chartImage) {
      const chartSheet = workbook.addWorksheet("Διάγραμμα");
      const base64 = body.chartImage.dataUrl.split(",")[1] ?? "";
      const imageId = workbook.addImage({ base64, extension: "png" });
      // Excel columns/rows aren't pixel units, so scale the source image down
      // to a sane on-sheet size instead of pasting it in at raw canvas size.
      const scale = Math.min(1, 900 / body.chartImage.width);
      chartSheet.addImage(imageId, { tl: { col: 0, row: 0 }, ext: { width: body.chartImage.width * scale, height: body.chartImage.height * scale } });
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": contentDisposition(`${body.filename}.xlsx`),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown export error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
