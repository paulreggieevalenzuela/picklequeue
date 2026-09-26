import type { Format, PairStats, PlayerId, QueueWeights, SessionPlayer, SessionSettings } from "../types";

export function pairKey(a: PlayerId, b: PlayerId): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export function teamSize(format: Format): number {
  return format === "doubles" ? 2 : 1;
}

interface Ctx {
  weights: QueueWeights;
  maxConsecutive: number | null;
  pairHistory: Record<string, PairStats>;
  /** Everyone currently eligible (used to know whether a requested partner is available). */
  available: ReadonlySet<PlayerId>;
}

function pair(ctx: Ctx, a: PlayerId, b: PlayerId): PairStats {
  return ctx.pairHistory[pairKey(a, b)] ?? { partner: 0, opponent: 0 };
}

/** Players who want to be on the same team as p (partner request or small group). */
function wantsWith(p: SessionPlayer, q: SessionPlayer): boolean {
  return p.partnerRequestId === q.id || (p.groupId !== null && p.groupId === q.groupId);
}

export interface Split {
  teamA: SessionPlayer[];
  teamB: SessionPlayer[];
  cost: number;
}

function splitCost(ctx: Ctx, a: SessionPlayer[], b: SessionPlayer[]): number {
  const w = ctx.weights;
  const sum = (t: SessionPlayer[]) => t.reduce((s, p) => s + p.skill, 0);
  let cost = w.teamBalance * Math.abs(sum(a) - sum(b));
  for (const team of [a, b]) {
    for (let i = 0; i < team.length; i++)
      for (let j = i + 1; j < team.length; j++) cost += w.repeatPartner * pair(ctx, team[i]!.id, team[j]!.id).partner;
  }
  for (const x of a)
    for (const y of b) {
      cost += w.repeatOpponent * pair(ctx, x.id, y.id).opponent;
      if (wantsWith(x, y)) cost += w.partnerRequest;
      if (wantsWith(y, x)) cost += w.partnerRequest;
    }
  return cost;
}

/**
 * Choose the best team split. With `together`, those players must share team A
 * (used by winners-stay so the winning team stays intact).
 */
export function bestSplit(ctx: Ctx, players: SessionPlayer[], together: PlayerId[] = []): Split | null {
  const half = players.length / 2;
  if (!Number.isInteger(half) || half < 1) return null;
  let best: Split | null = null;
  // Fix players[0] on team A to avoid mirrored duplicates (unless constrained).
  const idx = players.map((_, i) => i);
  for (const combo of combinations(idx, half)) {
    if (together.length === 0 && !combo.includes(0)) continue;
    const teamA = combo.map((i) => players[i]!);
    const teamB = players.filter((_, i) => !combo.includes(i));
    if (together.length > 0 && !together.every((id) => teamA.some((p) => p.id === id))) continue;
    const cost = splitCost(ctx, teamA, teamB);
    if (!best || cost < best.cost) best = { teamA, teamB, cost };
  }
  return best;
}

export function* combinations<T>(items: readonly T[], k: number, start = 0, acc: T[] = []): Generator<T[]> {
  if (acc.length === k) {
    yield [...acc];
    return;
  }
  for (let i = start; i <= items.length - (k - acc.length); i++) {
    acc.push(items[i]!);
    yield* combinations(items, k, i + 1, acc);
    acc.pop();
  }
}

export interface PickOptions {
  settings: SessionSettings;
  pairHistory: Record<string, PairStats>;
  format: Format;
  /** Eligible players in priority order (best first). */
  ranked: SessionPlayer[];
  /** Players already in the match (e.g. winners staying on). */
  fixed?: SessionPlayer[];
  /** Keep the fixed players together on one team. */
  keepFixedTogether?: boolean;
}

export interface Pick {
  teamA: SessionPlayer[];
  teamB: SessionPlayer[];
  cost: number;
}

/**
 * Pick the next match: the top-priority player (anchor) is always included,
 * the rest are chosen from the next K candidates by minimising a cost that
 * balances skill, variety, fairness (positions skipped) and rest rules.
 */
export function pickMatch(opts: PickOptions): Pick | null {
  const { settings, format, ranked } = opts;
  const fixed = opts.fixed ?? [];
  const need = teamSize(format) * 2 - fixed.length;
  if (need < 0) return null;
  if (need === 0) {
    const ctx = makeCtx(opts);
    const split = bestSplit(ctx, fixed, opts.keepFixedTogether ? fixed.map((p) => p.id) : []);
    return split && { ...split };
  }
  if (ranked.length < need) return null;

  const ctx = makeCtx(opts);
  const w = settings.weights;
  const [anchor, ...rest] = ranked;
  const candidates = rest.slice(0, Math.max(settings.candidatePool, need - 1));
  const minSkip = ((need - 1) * (need - 2)) / 2;

  let best: Pick | null = null;
  for (const chosen of combinations(candidates.map((_, i) => i), need - 1)) {
    const added = [anchor!, ...chosen.map((i) => candidates[i]!)];
    const group = [...fixed, ...added];

    let cost = w.rankSkipped * (chosen.reduce((s, i) => s + i, 0) - minSkip);

    const skills = group.map((p) => p.skill);
    cost += w.skillSpread * (Math.max(...skills) - Math.min(...skills));

    for (const p of added) {
      if (settings.maxConsecutive !== null && !p.satOut && p.consecutiveGames >= settings.maxConsecutive) {
        cost += w.consecutive;
      }
      // Penalise taking someone whose requested partner is waiting but left out.
      if (p.partnerRequestId && ctx.available.has(p.partnerRequestId) && !group.some((q) => q.id === p.partnerRequestId)) {
        cost += w.partnerRequest;
      }
    }

    if (best && cost >= best.cost) continue; // split cost is never negative
    const split = bestSplit(ctx, group, opts.keepFixedTogether ? fixed.map((p) => p.id) : []);
    if (!split) continue;
    cost += split.cost;
    if (!best || cost < best.cost) best = { teamA: split.teamA, teamB: split.teamB, cost };
  }
  return best;
}

function makeCtx(opts: PickOptions): Ctx {
  return {
    weights: opts.settings.weights,
    maxConsecutive: opts.settings.maxConsecutive,
    pairHistory: opts.pairHistory,
    available: new Set(opts.ranked.map((p) => p.id)),
  };
}
