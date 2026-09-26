import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { SessionState } from "@pickle-queue/core";
import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

/**
 * Server-only Neon access over HTTP (works in serverless and edge runtimes).
 * Never import from client code. The API routes are the single writer for
 * session state (architecture §7.3).
 */
let client: NeonQueryFunction<false, false> | null = null;

export function db(): NeonQueryFunction<false, false> | null {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  client ??= neon(url);
  return client;
}

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
export const newToken = () => randomBytes(24).toString("base64url");

export async function loadSession(sql: NeonQueryFunction<false, false>, id: string): Promise<SessionState | null> {
  const rows = await sql`select state from sessions where id = ${id}`;
  return (rows[0]?.state as SessionState | undefined) ?? null;
}

/** The token hash lives in `session_secrets`, which no read endpoint ever returns. */
export async function isOrganizer(req: Request, sql: NeonQueryFunction<false, false>, sessionId: string): Promise<boolean> {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return false;
  const rows = await sql`select admin_token_hash from session_secrets where session_id = ${sessionId}`;
  const stored = rows[0]?.admin_token_hash as string | undefined;
  if (!stored) return false;
  const a = Buffer.from(hashToken(token));
  const b = Buffer.from(stored);
  return a.length === b.length && timingSafeEqual(a, b);
}

export const notConfigured = () =>
  Response.json({ error: "Cloud sync isn't configured. Set DATABASE_URL (see README)." }, { status: 501 });
