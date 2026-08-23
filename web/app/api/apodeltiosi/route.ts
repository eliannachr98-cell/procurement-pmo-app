import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { requireAlertCode } from "@/lib/matching";
import { ApodeltiosiSchema, APODELTIOSI_PROMPT } from "@/lib/apodeltiosi";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Team-only feature (paid-tier candidate, same gate as Αγορά & Ανταγωνισμός) -
// this calls a paid external API per upload, unlike everything else in the
// app which only reads Supabase.
export async function POST(request: Request) {
  if (!requireAlertCode(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "ANTHROPIC_API_KEY missing" }, { status: 500 });

    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "Απαιτείται αρχείο PDF" }, { status: 400 });
    if (file.type !== "application/pdf") return NextResponse.json({ error: "Μόνο αρχεία PDF υποστηρίζονται προς το παρόν" }, { status: 400 });

    const MAX_BYTES = 30 * 1024 * 1024; // stay under Claude's 32MB document limit
    if (file.size > MAX_BYTES) return NextResponse.json({ error: "Το αρχείο είναι πολύ μεγάλο (όριο 30MB)" }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());
    const base64 = buffer.toString("base64");

    const client = new Anthropic({ apiKey });
    const response = await client.messages.parse({
      model: "claude-opus-5",
      max_tokens: 16000,
      messages: [{
        role: "user",
        content: [
          { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } },
          { type: "text", text: APODELTIOSI_PROMPT },
        ],
      }],
      output_config: { format: zodOutputFormat(ApodeltiosiSchema) },
    });

    if (!response.parsed_output) {
      return NextResponse.json({ error: "Δεν ήταν δυνατή η ανάλυση του εγγράφου" }, { status: 502 });
    }

    return NextResponse.json({ result: response.parsed_output });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown apodeltiosi error";
    console.error(`[apodeltiosi] ${message}`);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
