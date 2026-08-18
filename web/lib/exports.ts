export type ColumnType = "text" | "number" | "currency" | "date" | "month";

export type ExportPayload = {
  filename: string;
  title: string;
  headers: string[];
  rows: (string | number)[][];
  // Parallel to headers - defaults to "text" for any column left unset, so
  // €/count columns can render as 5.132.124 € / 1.502 instead of raw digits.
  columnTypes?: ColumnType[];
};

export type ChartImage = { dataUrl: string; width: number; height: number };

const numberFormatter = new Intl.NumberFormat("el-GR");
const currencyFormatter = new Intl.NumberFormat("el-GR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const dateFormatter = new Intl.DateTimeFormat("el-GR");
const monthFormatter = new Intl.DateTimeFormat("el-GR", { month: "short", year: "numeric" });

function formatCell(value: string | number, type: ColumnType | undefined): string {
  if ((type === "date" || type === "month") && value !== "" && value !== null) {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return type === "month" ? monthFormatter.format(date) : dateFormatter.format(date);
  }
  if (typeof value === "number") {
    if (type === "currency") return currencyFormatter.format(value);
    if (type === "number") return numberFormatter.format(value);
  }
  return String(value);
}

// Charts here are plain DOM (CSS bars/gradients), not <canvas>, so they need
// to be rasterized before they can go into an Excel sheet or PDF page.
export async function captureChartImage(el: HTMLElement | null): Promise<ChartImage | undefined> {
  if (!el) return undefined;
  try {
    const html2canvas = (await import("html2canvas")).default;
    const canvas = await html2canvas(el, { backgroundColor: "#ffffff", scale: 2 });
    return { dataUrl: canvas.toDataURL("image/png"), width: canvas.width, height: canvas.height };
  } catch {
    // Leaflet map tiles and other cross-origin content can taint the canvas -
    // fall back to a data-only export rather than failing the whole download.
    return undefined;
  }
}

export async function downloadExcel(payload: ExportPayload, chartImage?: ChartImage) {
  const response = await fetch("/api/export/excel", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filename: payload.filename, headers: payload.headers, rows: payload.rows, columnTypes: payload.columnTypes, chartImage }),
  });
  if (!response.ok) throw new Error(`Η δημιουργία του Excel απέτυχε (${response.status})`);
  saveBlob(await response.blob(), `${payload.filename}.xlsx`);
}

// jsPDF's built-in fonts only cover Latin text - Greek glyphs would come out
// blank. Rendering the report as real HTML and rasterizing it with the
// page's own (Greek-capable) font is the reliable way to get correct text,
// at the cost of the PDF being an image rather than selectable vector text.
export async function downloadPdf(payload: ExportPayload, chartImage?: ChartImage) {
  const [{ jsPDF }, html2canvas] = await Promise.all([
    import("jspdf"),
    import("html2canvas").then((mod) => mod.default),
  ]);

  const landscape = payload.headers.length > 5;
  const container = buildPrintableReport(payload, chartImage, landscape ? 1100 : 820);
  document.body.appendChild(container);
  try {
    const canvas = await html2canvas(container, { backgroundColor: "#ffffff", scale: 2 });
    const doc = new jsPDF({ orientation: landscape ? "landscape" : "portrait", unit: "pt", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 24;
    const usableWidth = pageWidth - margin * 2;
    const usableHeight = pageHeight - margin * 2;
    const scale = usableWidth / canvas.width;
    const sliceHeightPx = Math.max(1, Math.floor(usableHeight / scale));

    let offset = 0;
    let firstPage = true;
    while (offset < canvas.height) {
      const sliceHeight = Math.min(sliceHeightPx, canvas.height - offset);
      const slice = document.createElement("canvas");
      slice.width = canvas.width;
      slice.height = sliceHeight;
      const ctx = slice.getContext("2d");
      ctx?.drawImage(canvas, 0, offset, canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight);
      if (!firstPage) doc.addPage();
      doc.addImage(slice.toDataURL("image/png"), "PNG", margin, margin, usableWidth, sliceHeight * scale);
      offset += sliceHeight;
      firstPage = false;
    }
    doc.save(`${payload.filename}.pdf`);
  } finally {
    document.body.removeChild(container);
  }
}

function buildPrintableReport(payload: ExportPayload, chartImage: ChartImage | undefined, width: number): HTMLDivElement {
  const container = document.createElement("div");
  container.style.cssText = `position:fixed;left:-99999px;top:0;width:${width}px;background:#fff;padding:28px;font-family:Inter,Arial,sans-serif;color:#16222c;`;

  const title = document.createElement("h1");
  title.textContent = payload.title;
  title.style.cssText = "font-size:20px;margin:0 0 4px;";
  container.appendChild(title);

  const date = document.createElement("p");
  date.textContent = new Date().toLocaleDateString("el-GR");
  date.style.cssText = "font-size:11px;color:#6a7e8b;margin:0 0 18px;";
  container.appendChild(date);

  if (chartImage) {
    const img = document.createElement("img");
    img.src = chartImage.dataUrl;
    img.style.cssText = "max-width:100%;margin-bottom:22px;display:block;";
    container.appendChild(img);
  }

  const table = document.createElement("table");
  table.style.cssText = "width:100%;border-collapse:collapse;font-size:11px;table-layout:fixed;";

  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  for (const header of payload.headers) {
    const th = document.createElement("th");
    th.textContent = header;
    th.style.cssText = "text-align:left;padding:6px 8px;background:#16222c;color:#fff;border:1px solid #16222c;word-break:break-word;";
    headRow.appendChild(th);
  }
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  payload.rows.forEach((row, index) => {
    const tr = document.createElement("tr");
    tr.style.background = index % 2 ? "#f3f7f8" : "#ffffff";
    row.forEach((cell, columnIndex) => {
      const td = document.createElement("td");
      td.textContent = formatCell(cell, payload.columnTypes?.[columnIndex]);
      td.style.cssText = "padding:6px 8px;border:1px solid #d7e2e7;word-break:break-word;";
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  container.appendChild(table);

  return container;
}

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
