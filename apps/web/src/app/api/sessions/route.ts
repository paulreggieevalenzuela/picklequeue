import type { SessionState } from "@pickle-queue/core";
import { db, hashToken, newToken, notConfigured } from "@/lib/server/db";

/** Create a session. Returns the organizer token (only its hash is stored). */
export async function POST(req: Request) {
  const sql = db();
  if (!sql) return notConfigured();
  const { state } = ((await req.json().catch(() => ({}))) ?? {}) as { state?: SessionState };
  if (!state?.id || !state.joinCode || state.version !== 0) {
    return Response.json({ error: "Invalid session." }, { status: 400 });
  }
  const adminToken = newToken();
  try {
    await sql.transaction([
      sql`insert into sessions (id, join_code, name, version, state)
          values (${state.id}, ${state.joinCode}, ${state.name.slice(0, 80)}, 0, ${JSON.stringify(state)}::jsonb)`,
      sql`insert into session_secrets (session_id, admin_token_hash) values (${state.id}, ${hashToken(adminToken)})`,
    ]);
  } catch {
    return Response.json({ error: "That session or join code already exists." }, { status: 409 });
  }
  return Response.json({ adminToken }, { status: 201 });
}
