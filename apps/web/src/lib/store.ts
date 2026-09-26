"use client";

import {
  EngineError,
  applyCommand,
  createHistory,
  createSession,
  dispatch as dispatchCommand,
  makeId,
  makeJoinCode,
  undo as undoHistory,
  type Command,
  type Format,
  type QueueMode,
  type ScoringRules,
  type SessionHistory,
  type SessionState,
} from "@pickle-queue/core";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import * as cloud from "./cloud";

type DistributiveOmit<T, K extends keyof never> = T extends unknown ? Omit<T, K> : never;
/** A command without its timestamp; the store stamps it. */
export type CommandInput = DistributiveOmit<Command, "at">;

export type DispatchResult = { ok: true; state: SessionState } | { ok: false; error: string };

export interface NewSessionInput {
  name: string;
  courts: number;
  queueMode: QueueMode;
  format: Format;
  scoring: ScoringRules;
}

interface StoreState {
  sessions: Record<string, SessionHistory>;
  /** Organizer token per session (cloud mode). Its presence means "I run this session". */
  adminTokens: Record<string, string>;
  /** The player this device checked in as, per session. */
  me: Record<string, string>;
  /** Cloud mode: last state confirmed by the server, and commands not yet accepted by it. */
  synced: Record<string, SessionState>;
  pending: Record<string, Command[]>;

  createSession(input: NewSessionInput): string;
  dispatch(sessionId: string, cmd: CommandInput): DispatchResult;
  undo(sessionId: string): void;
  removeSession(sessionId: string): void;
  setMe(sessionId: string, playerId: string | null): void;
  /** Accept an authoritative state from the server (fetch or realtime). */
  receive(sessionId: string, state: SessionState): void;
  flush(sessionId: string): Promise<void>;
}

export const STORE_KEY = "pickle-queue:v1";
const PERSISTED_UNDO = 10;
const flushing = new Set<string>();

/** Re-apply local commands on top of a newer server state (they're deterministic). */
function rebase(base: SessionState, cmds: Command[]): { state: SessionState; kept: Command[] } {
  let state = base;
  const kept: Command[] = [];
  for (const c of cmds) {
    try {
      state = applyCommand(state, c);
      kept.push(c);
    } catch {
      // Conflicts with what someone else did; drop it.
    }
  }
  return { state, kept };
}

export const useStore = create<StoreState>()(
  persist(
    (set, get) => ({
      sessions: {},
      adminTokens: {},
      me: {},
      synced: {},
      pending: {},

      createSession(input) {
        const id = makeId("s_");
        const now = Date.now();
        const base = createSession({ id, name: input.name.trim() || "Open play", joinCode: makeJoinCode(), now, courts: input.courts, queueMode: input.queueMode });
        const state: SessionState = { ...base, settings: { ...base.settings, format: input.format, scoring: input.scoring } };
        set((s) => ({ sessions: { ...s.sessions, [id]: createHistory(state) } }));
        if (cloud.enabled) {
          void cloud.createSession(state).then((res) => {
            if (!res) return;
            set((s) => ({ adminTokens: { ...s.adminTokens, [id]: res.adminToken }, synced: { ...s.synced, [id]: state } }));
            void get().flush(id); // anything done while the session was being created
          });
        }
        return id;
      },

      dispatch(sessionId, input) {
        const h = get().sessions[sessionId];
        if (!h) return { ok: false, error: "This session isn't on this device." };
        const cmd = { ...input, at: Date.now() } as Command;
        try {
          const next = dispatchCommand(h, cmd);
          set((s) => ({
            sessions: { ...s.sessions, [sessionId]: next },
            pending: cloud.enabled ? { ...s.pending, [sessionId]: [...(s.pending[sessionId] ?? []), cmd] } : s.pending,
          }));
          if (cloud.enabled) void get().flush(sessionId);
          return { ok: true, state: next.present };
        } catch (e) {
          return { ok: false, error: e instanceof EngineError ? e.message : "Something went wrong. Try again." };
        }
      },

      undo(sessionId) {
        const h = get().sessions[sessionId];
        if (!h) return;
        if (cloud.enabled) {
          void cloud.undo(sessionId, get().adminTokens[sessionId]).then((state) => state && get().receive(sessionId, state));
          return;
        }
        set((s) => ({ sessions: { ...s.sessions, [sessionId]: undoHistory(h, Date.now()) } }));
      },

      removeSession(sessionId) {
        const without = <T,>(rec: Record<string, T>) => Object.fromEntries(Object.entries(rec).filter(([k]) => k !== sessionId));
        set((s) => ({ sessions: without(s.sessions), pending: without(s.pending), synced: without(s.synced) }));
      },

      setMe(sessionId, playerId) {
        set((s) => {
          const me = { ...s.me };
          if (playerId) me[sessionId] = playerId;
          else delete me[sessionId];
          return { me };
        });
      },

      receive(sessionId, incoming) {
        const current = get().synced[sessionId];
        if (current && current.version >= incoming.version) return;
        const { state, kept } = rebase(incoming, get().pending[sessionId] ?? []);
        set((s) => {
          const h = s.sessions[sessionId];
          return {
            synced: { ...s.synced, [sessionId]: incoming },
            pending: { ...s.pending, [sessionId]: kept },
            sessions: { ...s.sessions, [sessionId]: h ? { past: h.past, present: state } : createHistory(state) },
          };
        });
      },

      async flush(sessionId) {
        if (flushing.has(sessionId)) return;
        flushing.add(sessionId);
        try {
          for (;;) {
            const [cmd] = get().pending[sessionId] ?? [];
            const base = get().synced[sessionId];
            if (!cmd || !base) return;
            const res = await cloud.pushCommand(sessionId, base.version, cmd, get().adminTokens[sessionId]);
            if (res.kind === "offline") return; // retried when the browser comes back online
            if (res.kind === "ok") {
              // Server state is authoritative (server clock); replay anything still queued on top.
              const { state, kept } = rebase(res.state, (get().pending[sessionId] ?? []).slice(1));
              set((s) => {
                const h = s.sessions[sessionId];
                return {
                  synced: { ...s.synced, [sessionId]: res.state },
                  pending: { ...s.pending, [sessionId]: kept },
                  sessions: { ...s.sessions, [sessionId]: { past: h?.past ?? [], present: state } },
                };
              });
            } else if (res.kind === "conflict") {
              get().receive(sessionId, res.state);
            } else {
              // Rejected by the server (permissions / validation): drop it and rebuild on the server state.
              const { state, kept } = rebase(base, (get().pending[sessionId] ?? []).slice(1));
              set((s) => {
                const h = s.sessions[sessionId];
                return {
                  pending: { ...s.pending, [sessionId]: kept },
                  sessions: { ...s.sessions, [sessionId]: { past: h?.past ?? [], present: state } },
                };
              });
            }
          }
        } finally {
          flushing.delete(sessionId);
        }
      },
    }),
    {
      name: STORE_KEY,
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
      partialize: (s) => ({
        sessions: Object.fromEntries(
          Object.entries(s.sessions).map(([id, h]) => [id, { past: h.past.slice(-PERSISTED_UNDO), present: h.present }]),
        ),
        adminTokens: s.adminTokens,
        me: s.me,
        synced: s.synced,
        pending: s.pending,
      }),
    },
  ),
);

export function useSessionHistory(sessionId: string): SessionHistory | undefined {
  return useStore((s) => s.sessions[sessionId]);
}
