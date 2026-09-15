import { NextResponse } from "next/server";
import { supabaseGet, supabaseWrite, resolveTeam } from "@/lib/matching";

export const dynamic = "force-dynamic";

type TeamRow = { id: string; name: string; passcode: string };

// Self-service team signup - no email/verification, the creator just picks
// a name and a passcode for their team (see sql/teams.sql). Anyone who later
// enters that same name+passcode (see /api/teams/login) lands in this
// team's shared data, same as the single hardcoded ALERT_ACCESS_CODE worked
// before teams existed.
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const passcode = typeof body.passcode === "string" ? body.passcode.trim() : "";
    if (!name) return NextResponse.json({ error: "Όνομα λογαριασμού απαιτείται" }, { status: 400 });
    if (passcode.length < 4) return NextResponse.json({ error: "Ο κωδικός πρέπει να έχει τουλάχιστον 4 χαρακτήρες" }, { status: 400 });

    try {
      const [team] = await supabaseWrite<TeamRow[]>("teams", "POST", [{ name, passcode }]);
      return NextResponse.json({ team: { id: team.id, name: team.name } });
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      // Postgres unique_violation on the passcode column surfaces through
      // PostgREST as a 409 - the exact wording varies, so match on status
      // via the message prefix supabaseWrite throws with.
      if (message.includes("(409)")) {
        return NextResponse.json({ error: "Ο κωδικός χρησιμοποιείται ήδη, διάλεξε άλλον" }, { status: 409 });
      }
      throw error;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown teams error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// "Who am I" - the passcode alone (see resolveTeam) is enough to act on a
// team's data, but the account's display name isn't part of the localStorage
// session, so the Προφίλ tab re-fetches it here on load.
export async function GET(request: Request) {
  const team = await resolveTeam(request);
  if (!team) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const [row] = await supabaseGet<Pick<TeamRow, "id" | "name">[]>(`teams?select=id,name&id=eq.${team.id}`);
    return NextResponse.json({ team: row ?? team });
  } catch {
    return NextResponse.json({ team });
  }
}

// Rename the account - the Προφίλ tab's editable display name now writes
// straight to the real teams.name column instead of a localStorage-only
// cosmetic field.
export async function PATCH(request: Request) {
  const team = await resolveTeam(request);
  if (!team) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const body = await request.json().catch(() => ({}));
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) return NextResponse.json({ error: "Όνομα λογαριασμού απαιτείται" }, { status: 400 });
    const [row] = await supabaseWrite<TeamRow[]>(`teams?id=eq.${team.id}`, "PATCH", { name }, "return=representation");
    return NextResponse.json({ team: { id: row.id, name: row.name } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown teams error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
