import { courtMatch, matchPlayers } from "./queue/engine";
import { getBoard } from "./queue/view";
import type { PlayerId, SessionState, Timestamp } from "./types";

export interface ParsedEntry {
  name: string;
  skill: number | null;
  /** Why this line won't be checked in (duplicate etc.), or null if it will. */
  skip: "duplicate" | "already_here" | null;
  /** Existing checked-out player with this name: they're checked back in instead of added twice. */
  existingId: PlayerId | null;
}

/** "3.5" anywhere at the end, or a whole number set off by "-", ":" or brackets ("- 3", "(4)"). */
const SKILL_AT_END = /(\s*[-–—:(,[]\s*|\s+)([1-7](?:\.[05])?)\s*[)\]]?\s*$/;

/**
 * Parse a list pasted from a group chat, e.g.
 *   "1. Maria Santos 3.5\n2) Jun Reyes\n• Ana Cruz (4.0)"  or  "Maria, Jun, Ana"
 * Numbering, bullets and emoji are ignored; a trailing skill level is optional.
 */
export function parsePlayerList(text: string, state?: SessionState): ParsedEntry[] {
  const raw = text.includes("\n") ? text.split(/\r?\n/) : text.split(/[,;]/);
  const seen = new Set<string>();
  const byName = new Map<string, { id: PlayerId; left: boolean }>();
  for (const p of Object.values(state?.players ?? {})) byName.set(p.name.toLowerCase(), { id: p.id, left: p.status === "left" });

  const out: ParsedEntry[] = [];
  for (const line of raw) {
    if (/:\s*$/.test(line)) continue; // headings like "Players:"
    // Drop numbering/bullets/emoji in front and emoji/punctuation at the end.
    let s = line.replace(/^[^\p{L}]+/u, "").replace(/[^\p{L}\p{M}\p{N}.)\]]+$/u, "").trim();
    if (!s) continue;
    let skill: number | null = null;
    const m = s.match(SKILL_AT_END);
    if (m && s.slice(0, m.index).trim()) {
      const v = Number(m[2]);
      const separated = /[-–—:(,[]/.test(m[1]!);
      if (v >= 1 && v <= 7 && (m[2]!.includes(".") || (separated && v >= 2 && v <= 5))) {
        skill = v;
        s = s.slice(0, m.index);
      }
    }
    const name = s.replace(/[^\p{L}\p{M}\p{N}.'’)\]]+$/u, "").replace(/\s+/g, " ").trim().slice(0, 40);
    if (!name) continue;
    const key = name.toLowerCase();
    const existing = byName.get(key);
    const skip = seen.has(key) ? "duplicate" : existing && !existing.left ? "already_here" : null;
    seen.add(key);
    out.push({ name, skill, skip, existingId: existing?.left ? existing.id : null });
  }
  return out;
}

/** A plain-text roster for posting in the group chat. */
export function formatRoster(state: SessionState, now: Timestamp): string {
  const board = getBoard(state, now);
  const name = (id: PlayerId) => state.players[id]?.name ?? "?";
  const mins = (from: number) => Math.max(0, Math.floor((now - from) / 60000));
  const players = Object.values(state.players);
  const here = players.filter((p) => p.status !== "left");
  const lines: string[] = [state.name, `${here.length} players checked in`];

  const courts = state.courts
    .map((c) => ({ c, m: courtMatch(state, c.id) }))
    .filter((x) => x.m && matchPlayers(x.m).length > 0);
  if (courts.length) {
    lines.push("", "On court");
    for (const { c, m } of courts) {
      const vs = `${m!.teamA.map(name).join(" & ")} vs ${m!.teamB.map(name).join(" & ")}`;
      const when = m!.status === "in_progress" && m!.startedAt ? `playing ${mins(m!.startedAt)} min` : "called";
      lines.push(`${c.name}: ${vs} (${when})`);
    }
  }
  if (board.queue.length) {
    lines.push("", "In line");
    for (const q of board.queue) lines.push(`${q.position}. ${q.player.name} (waiting ${q.waitingMin} min)`);
  }
  const list = (label: string, status: string) => {
    const ps = players.filter((p) => p.status === status);
    if (ps.length) lines.push("", `${label}: ${ps.map((p) => p.name).join(", ")}`);
  };
  list("Resting", "resting");
  list("Away", "away");
  list("Checked out", "left");
  return lines.join("\n");
}
