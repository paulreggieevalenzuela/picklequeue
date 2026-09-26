import type { Command, SessionState } from "@pickle-queue/core";

/** The web app hosts the API (Next.js route handlers backed by Neon Postgres). */
export const API_URL = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, "") ?? "";
export const apiConfigured = API_URL.length > 0;

export async function findSession(code: string): Promise<string | null> {
  const res = await fetch(`${API_URL}/api/join/${encodeURIComponent(code)}`);
  return res.ok ? (await res.json()).sessionId : null;
}

export async function fetchSession(id: string): Promise<SessionState | null> {
  const res = await fetch(`${API_URL}/api/sessions/${id}`);
  return res.ok ? (await res.json()).state : null;
}

/** Send a player command, retrying once on a version conflict. */
export async function sendCommand(id: string, command: Command): Promise<SessionState> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const current = await fetchSession(id);
    if (!current) throw new Error("Session not found.");
    const res = await fetch(`${API_URL}/api/sessions/${id}/commands`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ expectedVersion: current.version, command }),
    });
    const body = await res.json();
    if (res.ok) return body.state;
    if (res.status !== 409) throw new Error(body.error ?? "Something went wrong.");
  }
  throw new Error("The session is busy. Try again.");
}
