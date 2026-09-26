"use client";

import type { Command, SessionState } from "@pickle-queue/core";

/**
 * Cloud sync is optional. Without a database the app runs fully local-first
 * (one device, synced across tabs). With DATABASE_URL set on the server, the
 * server is authoritative and every device follows it by checking for newer
 * versions every couple of seconds.
 */
export const enabled = process.env.NEXT_PUBLIC_CLOUD_SYNC === "1";

const POLL_MS = 2_000;

export type PushResult =
  | { kind: "ok"; state: SessionState }
  | { kind: "conflict"; state: SessionState }
  | { kind: "rejected"; error: string }
  | { kind: "offline" };

const headers = (token?: string): HeadersInit => ({
  "content-type": "application/json",
  ...(token ? { authorization: `Bearer ${token}` } : {}),
});

export async function pushCommand(sessionId: string, expectedVersion: number, command: Command, token?: string): Promise<PushResult> {
  try {
    const res = await fetch(`/api/sessions/${sessionId}/commands`, {
      method: "POST",
      headers: headers(token),
      body: JSON.stringify({ expectedVersion, command }),
    });
    const body = await res.json();
    if (res.ok) return { kind: "ok", state: body.state };
    if (res.status === 409) return { kind: "conflict", state: body.state };
    return { kind: "rejected", error: body.error ?? res.statusText };
  } catch {
    return { kind: "offline" };
  }
}

export async function createSession(state: SessionState): Promise<{ adminToken: string } | null> {
  try {
    const res = await fetch(`/api/sessions`, { method: "POST", headers: headers(), body: JSON.stringify({ state }) });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

export async function fetchSession(sessionId: string): Promise<SessionState | null> {
  try {
    const res = await fetch(`/api/sessions/${sessionId}`);
    return res.ok ? (await res.json()).state : null;
  } catch {
    return null;
  }
}

export async function findByJoinCode(code: string): Promise<string | null> {
  try {
    const res = await fetch(`/api/join/${encodeURIComponent(code)}`);
    return res.ok ? (await res.json()).sessionId : null;
  } catch {
    return null;
  }
}

export async function undo(sessionId: string, token?: string): Promise<SessionState | null> {
  try {
    const res = await fetch(`/api/sessions/${sessionId}/undo`, { method: "POST", headers: headers(token) });
    return res.ok ? (await res.json()).state : null;
  } catch {
    return null;
  }
}

/**
 * Live updates: ask for anything newer than the version we have. The server
 * answers 204 when nothing changed, so this is cheap. Pauses while the tab is hidden.
 */
export function subscribe(sessionId: string, getVersion: () => number, onState: (s: SessionState) => void): () => void {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const tick = async () => {
    if (stopped) return;
    if (document.visibilityState === "visible") {
      try {
        const res = await fetch(`/api/sessions/${sessionId}?since=${getVersion()}`, { cache: "no-store" });
        if (res.status === 200) onState((await res.json()).state);
      } catch {
        // Offline: keep trying quietly.
      }
    }
    if (!stopped) timer = setTimeout(tick, POLL_MS);
  };

  const onVisible = () => {
    if (document.visibilityState === "visible") {
      clearTimeout(timer);
      void tick();
    }
  };
  document.addEventListener("visibilitychange", onVisible);
  void tick();

  return () => {
    stopped = true;
    clearTimeout(timer);
    document.removeEventListener("visibilitychange", onVisible);
  };
}
