import { EngineError, applyCommand, commandEnvelopeSchema, type Command } from "@pickle-queue/core";
import { db, isOrganizer, loadSession, notConfigured } from "@/lib/server/db";

/** Commands a player may send about themselves without the organizer token. */
const PLAYER_COMMANDS = new Set<Command["type"]>(["AddPlayer", "SetRest", "SetAway", "ReturnPlayer", "SetPartnerRequest"]);

/**
 * POST /api/sessions/:id/commands  { expectedVersion, command }
 * Optimistic concurrency: the write only lands if nobody else changed the
 * session since `expectedVersion`; otherwise 409 with the current state.
 */
export async function POST(req: Request, ctx: RouteContext<"/api/sessions/[id]/commands">) {
  const sql = db();
  if (!sql) return notConfigured();
  const { id } = await ctx.params;

  const parsed = commandEnvelopeSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid command.", issues: parsed.error.issues }, { status: 400 });
  const { expectedVersion } = parsed.data;
  // Server clock is authoritative.
  const command = { ...parsed.data.command, at: Date.now() } as Command;

  const [current, organizer] = await Promise.all([loadSession(sql, id), isOrganizer(req, sql, id)]);
  if (!current) return Response.json({ error: "Session not found." }, { status: 404 });
  if (!organizer && !PLAYER_COMMANDS.has(command.type)) {
    return Response.json({ error: "Only the organizer can do that." }, { status: 403 });
  }
  if (current.version !== expectedVersion) return Response.json({ state: current }, { status: 409 });

  const actor = organizer ? "organizer" : "player";
  let next;
  try {
    next = applyCommand(current, { ...command, actor });
  } catch (e) {
    if (e instanceof EngineError) return Response.json({ error: e.message, code: e.code }, { status: 422 });
    throw e;
  }

  // One atomic statement: update only if the version still matches, and log the event.
  const written = await sql`
    with upd as (
      update sessions
         set state = ${JSON.stringify(next)}::jsonb, version = ${next.version}, name = ${next.name.slice(0, 80)}, updated_at = now()
       where id = ${id} and version = ${expectedVersion}
       returning id
    )
    insert into session_events (session_id, version, type, payload, actor, state_before)
    select id, ${next.version}, ${command.type}, ${JSON.stringify(command)}::jsonb, ${actor}, ${JSON.stringify(current)}::jsonb from upd
    returning id`;
  if (written.length === 0) {
    return Response.json({ state: await loadSession(sql, id) }, { status: 409 });
  }
  return Response.json({ state: next });
}
