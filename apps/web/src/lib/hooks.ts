"use client";

import { canUndo, getBoard, type Board, type SessionState } from "@pickle-queue/core";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import * as cloud from "./cloud";
import { STORE_KEY, useStore, type CommandInput, type DispatchResult } from "./store";

const hydration = {
  subscribe: (cb: () => void) => useStore.persist.onFinishHydration(cb),
  get: () => useStore.persist.hasHydrated(),
};

/** True once the local store has loaded from storage (always false on the server). */
export function useHydrated(): boolean {
  return useSyncExternalStore(hydration.subscribe, hydration.get, () => false);
}

/** Mount once: loads persisted state and keeps tabs/windows in sync (e.g. a TV window). */
export function useStoreSync() {
  useEffect(() => {
    void useStore.persist.rehydrate();
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORE_KEY) void useStore.persist.rehydrate();
    };
    const onOnline = () => {
      for (const id of Object.keys(useStore.getState().pending)) void useStore.getState().flush(id);
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("online", onOnline);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("online", onOnline);
    };
  }, []);
}

/** Current time, refreshed every `ms` for ETAs and match timers. */
export function useNow(ms = 15_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

export type SessionStatus = "loading" | "ready" | "missing";

export interface UseSession {
  status: SessionStatus;
  state: SessionState | undefined;
  board: Board | undefined;
  now: number;
  canUndo: boolean;
  isOrganizer: boolean;
  dispatch: (cmd: CommandInput) => DispatchResult;
  undo: () => void;
}

export function useSession(sessionId: string, tickMs?: number): UseSession {
  const hydrated = useHydrated();
  const history = useStore((s) => s.sessions[sessionId]);
  const hasToken = useStore((s) => Boolean(s.adminTokens[sessionId]));
  const [cloudChecked, setCloudChecked] = useState(!cloud.enabled);
  const now = useNow(tickMs);

  // Cloud: fetch the session if this device doesn't have it, then stay live.
  useEffect(() => {
    if (!cloud.enabled || !hydrated) return;
    let alive = true;
    void cloud.fetchSession(sessionId).then((state) => {
      if (!alive) return;
      if (state) useStore.getState().receive(sessionId, state);
      setCloudChecked(true);
    });
    const off = cloud.subscribe(
      sessionId,
      () => useStore.getState().synced[sessionId]?.version ?? 0,
      (s) => useStore.getState().receive(sessionId, s),
    );
    return () => {
      alive = false;
      off();
    };
  }, [sessionId, hydrated]);

  const state = history?.present;
  const board = useMemo(() => (state ? getBoard(state, now) : undefined), [state, now]);
  const dispatch = useCallback((cmd: CommandInput) => useStore.getState().dispatch(sessionId, cmd), [sessionId]);
  const undo = useCallback(() => useStore.getState().undo(sessionId), [sessionId]);

  const status: SessionStatus = !hydrated ? "loading" : state ? "ready" : cloudChecked ? "missing" : "loading";

  return {
    status,
    state,
    board,
    now,
    canUndo: history ? canUndo(history) : false,
    // Local mode: whoever created the session on this device runs it.
    isOrganizer: cloud.enabled ? hasToken : Boolean(history),
    dispatch,
    undo,
  };
}
