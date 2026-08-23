import { NextResponse } from "next/server";
import { Document, Packer, Paragraph, HeadingLevel, Table, TableRow, TableCell, TextRun, WidthType, ShadingType, BorderStyle } from "docx";
import { requireAlertCode } from "@/lib/matching";
import { ApodeltiosiSchema, type Apodeltiosi } from "@/lib/apodeltiosi";

export const dynamic = "force-dynamic";

const HEADER_SHADING = { type: ShadingType.CLEAR, fill: "168C8C" };
const CELL_BORDER = { style: BorderStyle.SINGLE, size: 2, color: "CBDBE3" };
const CELL_BORDERS = { top: CELL_BORDER, bottom: CELL_BORDER, left: CELL_BORDER, right: CELL_BORDER };

function headerCell(text: string, widthPct: number) {
  return new TableCell({
    width: { size: widthPct, type: WidthType.PERCENTAGE },
    shading: HEADER_SHADING,
    borders: CELL_BORDERS,
    children: [new Paragraph({ children: [new TextRun({ text, bold: true, color: "FFFFFF", size: 20 })] })],
  });
}

function bodyCell(text: string, widthPct: number) {
  return new TableCell({
    width: { size: widthPct, type: WidthType.PERCENTAGE },
    borders: CELL_BORDERS,
    children: [new Paragraph({ children: [new TextRun({ text, size: 20 })] })],
  });
}

function twoColTable(headerA: string, headerB: string, rows: [string, string][]) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({ tableHeader: true, children: [headerCell(headerA, 35), headerCell(headerB, 65)] }),
      ...rows.map(([a, b]) => new TableRow({ children: [bodyCell(a, 35), bodyCell(b, 65)] })),
    ],
  });
}

function sectionHeading(text: string) {
  return new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 300, after: 120 }, children: [new TextRun({ text })] });
}

function subHeading(text: string) {
  return new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 200, after: 100 }, children: [new TextRun({ text })] });
}

function bullet(text: string) {
  // Plain "• " prefix rather than a real numbering.xml list definition - this
  // is a one-shot generated report, not a document the user restructures by
  // inserting/deleting list items, so the extra list-numbering machinery
  // isn't worth the added complexity/risk here.
  return new Paragraph({ spacing: { after: 80 }, children: [new TextRun({ text: `•  ${text}`, size: 20 })] });
}

function buildDocument(data: Apodeltiosi) {
  const children: (Paragraph | Table)[] = [
    new Paragraph({ heading: HeadingLevel.TITLE, spacing: { after: 120 }, children: [new TextRun({ text: "ΑΠΟΔΕΛΤΙΩΣΗ ΔΙΑΚΗΡΥΞΗΣ" })] }),
    new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: `«${data.titlos}»`, bold: true, size: 24 })] }),
  ];
  if (data.arithmosDiakiryxis) {
    children.push(new Paragraph({ spacing: { after: 200 }, children: [new TextRun({ text: `Αρ. Διακ.: ${data.arithmosDiakiryxis}`, size: 20 })] }));
  }

  children.push(sectionHeading("1. ΒΑΣΙΚΑ ΣΤΟΙΧΕΙΑ ΔΙΑΓΩΝΙΣΜΟΥ"));
  children.push(twoColTable("ΣΤΟΙΧΕΙΟ", "ΠΛΗΡΟΦΟΡΙΑ", data.basikaStoixeia.map((item) => [item.stoixeio, item.plirofpria])));

  children.push(sectionHeading("2. ΚΡΙΣΙΜΕΣ ΠΡΟΘΕΣΜΙΕΣ"));
  children.push(twoColTable("ΕΝΕΡΓΕΙΑ", "ΗΜΕΡΟΜΗΝΙΑ / ΩΡΑ", data.prothesmies.map((item) => [item.energeia, item.imerominia])));

  if (data.enosiEtaireion) {
    children.push(sectionHeading("3. ΣΥΜΜΕΤΟΧΗ ΩΣ ΕΝΩΣΗ ΕΤΑΙΡΕΙΩΝ"));
    if (data.enosiEtaireion.genikesArxes.length) {
      children.push(subHeading("3.1 Γενικές Αρχές"));
      data.enosiEtaireion.genikesArxes.forEach((item) => children.push(bullet(item)));
    }
    if (data.enosiEtaireion.ypoxreotikaStoixeia.length) {
      children.push(subHeading("3.2 Υποχρεωτικά Στοιχεία Προσφοράς Ένωσης"));
      data.enosiEtaireion.ypoxreotikaStoixeia.forEach((item) => children.push(bullet(item)));
    }
  }

  children.push(sectionHeading("4. ΚΡΙΤΗΡΙΑ ΠΟΙΟΤΙΚΗΣ ΕΠΙΛΟΓΗΣ"));
  const k = data.kritiriaPoiotikisEpilogis;
  if (k.katallilotita.length) {
    children.push(subHeading("4.1 Καταλληλότητα"));
    k.katallilotita.forEach((item) => children.push(bullet(item)));
  }
  if (k.oikonomikiEparkeia.length) {
    children.push(subHeading("4.2 Οικονομική Επάρκεια"));
    k.oikonomikiEparkeia.forEach((item) => children.push(bullet(item)));
  }
  if (k.texnikiIkanotita.length) {
    children.push(subHeading("4.3 Τεχνική Ικανότητα"));
    k.texnikiIkanotita.forEach((item) => children.push(bullet(item)));
  }
  if (k.omadaErgou.length) {
    children.push(subHeading("4.4 Ομάδα Έργου"));
    children.push(twoColTable("ΡΟΛΟΣ", "ΕΛΑΧΙΣΤΑ ΠΡΟΣΟΝΤΑ", k.omadaErgou.map((item) => [item.rolos, item.prosonta])));
  }
  if (k.pistopoiitikaISO.length) {
    children.push(subHeading("4.5 Πιστοποιητικά ISO"));
    children.push(twoColTable("ΠΙΣΤΟΠΟΙΗΤΙΚΟ", "ΠΕΔΙΟ ΕΦΑΡΜΟΓΗΣ", k.pistopoiitikaISO.map((item) => [item.pistopoiitiko, item.pedio])));
  }

  children.push(sectionHeading("5. ΤΙ ΥΠΟΒΑΛΛΟΥΜΕ - ΠΛΗΡΗΣ ΛΙΣΤΑ"));
  const y = data.tiYpovalloume;
  if (y.dikaiologitikaSymmetoxis.length) {
    children.push(subHeading("5.1 Δικαιολογητικά Συμμετοχής - Τεχνική Προσφορά"));
    y.dikaiologitikaSymmetoxis.forEach((item) => children.push(bullet(item)));
  }
  if (y.oikonomikiProsfora.length) {
    children.push(subHeading("5.2 Οικονομική Προσφορά"));
    y.oikonomikiProsfora.forEach((item) => children.push(bullet(item)));
  }
  if (y.isxysProsforas.length) {
    children.push(subHeading("5.3 Ισχύς Προσφοράς"));
    y.isxysProsforas.forEach((item) => children.push(bullet(item)));
  }
  if (y.dikaiologitikaProsorinouAnadoxou.length) {
    children.push(subHeading("5.4 Δικαιολογητικά Προσωρινού Αναδόχου"));
    y.dikaiologitikaProsorinouAnadoxou.forEach((item) => children.push(bullet(item)));
  }

  if (data.epishmanseis.length) {
    children.push(sectionHeading("6. ΣΗΜΑΝΤΙΚΕΣ ΕΠΙΣΗΜΑΝΣΕΙΣ"));
    data.epishmanseis.forEach((item) => children.push(bullet(item)));
  }

  return new Document({ sections: [{ children }] });
}

export async function POST(request: Request) {
  if (!requireAlertCode(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const body = await request.json().catch(() => null);
    const parsed = ApodeltiosiSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "Μη έγκυρα δεδομένα αποδελτίωσης" }, { status: 400 });

    const doc = buildDocument(parsed.data);
    const buffer = await Packer.toBuffer(doc);

    const safeTitle = parsed.data.titlos.slice(0, 60).replace(/[^\p{L}\p{N} ]/gu, "").trim() || "apodeltiosi";
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="Αποδελτίωση_${safeTitle}.docx"`,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown apodeltiosi/docx error";
    console.error(`[apodeltiosi/docx] ${message}`);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
