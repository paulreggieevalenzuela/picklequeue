import type { Command, SessionState, Timestamp } from "../types";
import { applyCommand } from "./engine";

const MAX_UNDO = 50;

/** Session state plus snapshots for "Undo last change". */
export interface SessionHistory {
  past: SessionState[];
  present: SessionState;
}

export function createHistory(present: SessionState): SessionHistory {
  return { past: [], present };
}

export function dispatch(h: SessionHistory, cmd: Command): SessionHistory {
  const next = applyCommand(h.present, cmd);
  return { past: [...h.past, h.present].slice(-MAX_UNDO), present: next };
}

export function canUndo(h: SessionHistory): boolean {
  return h.past.length > 0;
}

/**
 * Restore the previous snapshot. The version keeps increasing so other
 * devices see undo as a new change rather than going back in time.
 */
export function undo(h: SessionHistory, at: Timestamp, actor: string | null = null): SessionHistory {
  const prev = h.past[h.past.length - 1];
  if (!prev) return h;
  const undone = h.present.log[h.present.log.length - 1];
  const version = h.present.version + 1;
  return {
    past: h.past.slice(0, -1),
    present: {
      ...prev,
      version,
      log: [
        ...h.present.log,
        { version, at, type: "Undo" as const, summary: `Undid: ${undone?.summary ?? "last change"}`, actor },
      ].slice(-500),
    },
  };
}
