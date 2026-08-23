import { NextResponse } from "next/server";
import { supabaseRpc, requireAlertCode } from "@/lib/matching";

export const dynamic = "force-dynamic";

type AlertRow = {
  adam: string;
  title: string;
  authority: string;
  contractType: string | null;
  documentType: string | null;
  publicationDate: string | null;
  openingDate: string | null;
  budget: number;
  hasAward: boolean;
  matchedCpv: string[];
  cpvs: { code: string; description: string | null }[];
};

// Backs the Ειδοποιήσεις page's "Υποβεβλημένες προσφορές"/"Ενδιαφέρον για
// συμμετοχή" lists - these track specific ADAMs the user marked themselves,
// so they're looked up directly rather than through /api/alerts, which only
// returns notices matching the *current* CPV watchlist within a recent
// window (removing a watched CPV would otherwise make an already-tracked
// tender disappear from these lists).
export async function GET(request: Request) {
  if (!requireAlertCode(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const adams = new URL(request.url).searchParams.getAll("adam").flatMap((value) => value.split(",")).map((value) => value.trim()).filter(Boolean);
    if (!adams.length) return NextResponse.json({ items: [] });
    const items = await supabaseRpc<AlertRow[]>("tenders_by_adam", { p_adams: adams });
    return NextResponse.json({ items: items ?? [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown alert-tenders error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
