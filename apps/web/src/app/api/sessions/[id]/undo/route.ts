import type { SessionState } from "@pickle-queue/core";
import { db, isOrganizer, loadSession, notConfigured } from "@/lib/server/db";

/** Undo the most recent command by restoring the state saved before it. */
export async function POST(req: Request, ctx: RouteContext<"/api/sessions/[id]/undo">) {
  const sql = db();
  if (!sql) return notConfigured();
  const { id } = await ctx.params;
  const [current, organizer] = await Promise.all([loadSession(sql, id), isOrganizer(req, sql, id)]);
  if (!current) return Response.json({ error: "Session not found." }, { status: 404 });
  if (!organizer) return Response.json({ error: "Only the organizer can undo." }, { status: 403 });

  const [last] = await sql`
    select id, type, state_before from session_events
     where session_id = ${id} and not undone and type <> 'Undo'
     order by version desc limit 1`;
  if (!last?.state_before) return Response.json({ error: "Nothing to undo." }, { status: 409 });

  const before = last.state_before as SessionState;
  const version = current.version + 1;
  const restored: SessionState = {
    ...before,
    version,
    log: [
      ...current.log,
      { version, at: Date.now(), type: "Undo" as const, summary: `Undid: ${current.log.at(-1)?.summary ?? last.type}`, actor: "organizer" },
    ].slice(-500),
  };

  const written = await sql`
    with upd as (
      update sessions set state = ${JSON.stringify(restored)}::jsonb, version = ${version}, updated_at = now()
       where id = ${id} and version = ${current.version}
       returning id
    ), mark as (
      update session_events set undone = true where id = ${last.id} and exists (select 1 from upd)
    )
    insert into session_events (session_id, version, type, payload, actor, state_before)
    select id, ${version}, 'Undo', '{}'::jsonb, 'organizer', ${JSON.stringify(current)}::jsonb from upd
    returning id`;
  if (written.length === 0) return Response.json({ error: "Someone else just made a change. Try again." }, { status: 409 });
  return Response.json({ state: restored });
}
