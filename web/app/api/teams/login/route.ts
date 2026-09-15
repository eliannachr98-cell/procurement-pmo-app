import { NextResponse } from "next/server";
import { supabaseGet } from "@/lib/matching";

export const dynamic = "force-dynamic";

type TeamRow = { id: string; name: string; avatar: string | null };

// Login checks name AND passcode together (not passcode alone) - the name
// isn't a secret, but requiring both means a typo'd or half-remembered
// passcode can't accidentally land in a different, unrelated account that
// happens to share it, and it matches how signup already asks for both.
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const passcode = typeof body.passcode === "string" ? body.passcode.trim() : "";
    if (!name || !passcode) return NextResponse.json({ error: "Όνομα λογαριασμού και κωδικός απαιτούνται" }, { status: 400 });

    const [team] = await supabaseGet<TeamRow[]>(
      `teams?select=id,name,avatar&name=eq.${encodeURIComponent(name)}&passcode=eq.${encodeURIComponent(passcode)}`,
    );
    if (!team) return NextResponse.json({ error: "Λάθος όνομα ή κωδικός" }, { status: 401 });
    return NextResponse.json({ team });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown login error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
