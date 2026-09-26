import { db, notConfigured } from "@/lib/server/db";

/** Resolve a 6-letter join code to a session id. */
export async function GET(_req: Request, ctx: RouteContext<"/api/join/[code]">) {
  const sql = db();
  if (!sql) return notConfigured();
  const { code } = await ctx.params;
  if (!/^[A-Z0-9]{6}$/i.test(code)) return Response.json({ error: "Invalid code." }, { status: 400 });
  const [row] = await sql`select id from sessions where join_code = ${code.toUpperCase()}`;
  if (!row) return Response.json({ error: "No session with that code." }, { status: 404 });
  return Response.json({ sessionId: row.id });
}
