import { db, notConfigured } from "@/lib/server/db";

/**
 * GET /api/sessions/:id[?since=version]
 * With `since`, returns 204 (no body) when nothing changed, so clients can
 * check for updates every second or two at almost no cost.
 */
export async function GET(req: Request, ctx: RouteContext<"/api/sessions/[id]">) {
  const sql = db();
  if (!sql) return notConfigured();
  const { id } = await ctx.params;
  const since = Number(new URL(req.url).searchParams.get("since"));
  const rows = Number.isFinite(since) && since > 0
    ? await sql`select version, case when version > ${since} then state end as state from sessions where id = ${id}`
    : await sql`select version, state from sessions where id = ${id}`;
  const row = rows[0];
  if (!row) return Response.json({ error: "Session not found." }, { status: 404 });
  if (!row.state) return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
  return Response.json({ state: row.state }, { headers: { "cache-control": "no-store" } });
}
