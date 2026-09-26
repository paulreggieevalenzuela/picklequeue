import { replayScore } from "../scoring/engine";
import {
  EngineError,
  type Command,
  type Court,
  type CourtId,
  type Format,
  type Match,
  type MatchId,
  type PlayerId,
  type QueueMode,
  type SessionPlayer,
  type SessionSettings,
  type SessionState,
  type Team,
  type Timestamp,
} from "../types";
import { bestSplit, pairKey, pickMatch, teamSize } from "./matchmaking";
import { lateArrivalCredit, rankWaiting } from "./priority";
import { defaultSettings, MODE_WEIGHTS } from "./settings";

const LOG_LIMIT = 500;

export interface CreateSessionInput {
  id: string;
  name: string;
  joinCode: string;
  now: Timestamp;
  courts?: number | { id: CourtId; name: string }[];
  queueMode?: QueueMode;
  settings?: Partial<SessionSettings>;
}

export function createSession(input: CreateSessionInput): SessionState {
  const courtsInput = input.courts ?? 2;
  const courts: Court[] =
    typeof courtsInput === "number"
      ? Array.from({ length: courtsInput }, (_, i) => ({ id: `c${i + 1}`, name: `Court ${i + 1}`, active: true, format: null }))
      : courtsInput.map((c) => ({ ...c, active: true, format: null }));
  return {
    id: input.id,
    name: input.name,
    joinCode: input.joinCode,
    createdAt: input.now,
    version: 0,
    settings: { ...defaultSettings(input.queueMode), ...input.settings },
    courts,
    players: {},
    matches: [],
    pairHistory: {},
    nextSeq: 1,
    log: [],
  };
}

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

export const matchPlayers = (m: Match): PlayerId[] => [...m.teamA, ...m.teamB];

const isLive = (m: Match) => m.status === "called" || m.status === "in_progress";

export function findMatchOf(state: SessionState, playerId: PlayerId, statuses: Match["status"][]): Match | undefined {
  return state.matches.find((m) => statuses.includes(m.status) && matchPlayers(m).includes(playerId));
}

export function courtMatch(state: SessionState, courtId: CourtId): Match | undefined {
  return state.matches.find((m) => m.courtId === courtId && isLive(m));
}

export function proposedMatches(state: SessionState): Match[] {
  return state.matches.filter((m) => m.status === "proposed");
}

function courtFormat(state: SessionState, court: Court): Format {
  return court.format ?? state.settings.format;
}

function isFull(m: Match): boolean {
  const size = teamSize(m.format);
  return m.teamA.length === size && m.teamB.length === size;
}

// ---------------------------------------------------------------------------
// Internal helpers (operate on a draft copy)
// ---------------------------------------------------------------------------

function clone(state: SessionState): SessionState {
  // Plain JSON data; JSON clone works on every runtime (incl. React Native / Hermes).
  return JSON.parse(JSON.stringify(state)) as SessionState;
}

function getPlayer(s: SessionState, id: PlayerId): SessionPlayer {
  const p = s.players[id];
  if (!p) throw new EngineError(`Unknown player ${id}`, "not_found");
  return p;
}

function getMatch(s: SessionState, id: MatchId): Match {
  const m = s.matches.find((x) => x.id === id);
  if (!m) throw new EngineError(`Unknown match ${id}`, "not_found");
  return m;
}

function getCourt(s: SessionState, id: CourtId): Court {
  const c = s.courts.find((x) => x.id === id);
  if (!c) throw new EngineError(`Unknown court ${id}`, "not_found");
  return c;
}

function nextId(s: SessionState, prefix: string): string {
  return `${prefix}${s.nextSeq++}`;
}

function setStatus(s: SessionState, ids: PlayerId[], status: SessionPlayer["status"]) {
  for (const id of ids) {
    const p = s.players[id];
    if (p) p.status = status;
  }
}

/** Take a player out of a (non-completed) match without changing their priority. */
function removeFromMatch(m: Match, playerId: PlayerId) {
  m.teamA = m.teamA.filter((id) => id !== playerId);
  m.teamB = m.teamB.filter((id) => id !== playerId);
  m.locked = m.locked.filter((id) => id !== playerId);
}

/** Pull a player out of whatever proposed/called match holds them. Throws if on court. */
function detach(s: SessionState, playerId: PlayerId) {
  const m = findMatchOf(s, playerId, ["proposed", "called", "in_progress"]);
  if (!m) return;
  if (m.status === "in_progress") {
    throw new EngineError("Player is on court. Finish or cancel the match first.", "invalid_state");
  }
  removeFromMatch(m, playerId);
  if (m.status === "proposed" && m.locked.length === 0) {
    // Auto-generated: simply let regeneration rebuild it.
    s.matches = s.matches.filter((x) => x.id !== m.id);
  }
}

function assertAvailable(s: SessionState, ids: PlayerId[], allowMatch?: MatchId) {
  const seen = new Set<PlayerId>();
  for (const id of ids) {
    if (seen.has(id)) throw new EngineError("A player can't appear twice in one match.", "invalid_input");
    seen.add(id);
    const p = getPlayer(s, id);
    const live = findMatchOf(s, id, ["called", "in_progress"]);
    if (live && live.id !== allowMatch) {
      throw new EngineError(`${p.name} is already in a called or live match.`, "invalid_state");
    }
    if (live?.id !== allowMatch && p.status !== "waiting") {
      throw new EngineError(`${p.name} is ${p.status}, not waiting.`, "invalid_state");
    }
  }
}

function validateTeams(format: Format, teamA: PlayerId[], teamB: PlayerId[]) {
  const size = teamSize(format);
  if (teamA.length > size || teamB.length > size) {
    throw new EngineError(`Each team has at most ${size} player(s) in ${format}.`, "invalid_input");
  }
}

function newMatch(s: SessionState, at: Timestamp, fields: Partial<Match> & Pick<Match, "teamA" | "teamB" | "format">): Match {
  const { id, ...rest } = fields;
  return {
    id: id ?? nextId(s, "m"),
    courtId: null,
    status: "proposed",
    source: "auto",
    locked: [],
    createdAt: at,
    calledAt: null,
    startedAt: null,
    endedAt: null,
    result: null,
    scoreEvents: [],
    ...rest,
  };
}

function callMatch(s: SessionState, m: Match, courtId: CourtId, at: Timestamp) {
  m.status = "called";
  m.courtId = courtId;
  m.calledAt = at;
  const inMatch = new Set(matchPlayers(m));
  setStatus(s, [...inMatch], "called");
  // Everyone else still waiting has now sat out a rotation.
  for (const p of Object.values(s.players)) {
    if (p.status === "waiting" && !inMatch.has(p.id)) p.satOut = true;
  }
}

// ---------------------------------------------------------------------------
// Regeneration: only the `proposed` horizon is ever rebuilt automatically.
// ---------------------------------------------------------------------------

function horizon(s: SessionState): number {
  const active = s.courts.filter((c) => c.active).length;
  return Math.max(1, active) * s.settings.lookAheadPerCourt;
}

function sameSet(a: PlayerId[], b: PlayerId[]) {
  return a.length === b.length && a.every((x) => b.includes(x));
}

export function regenerate(s: SessionState, at: Timestamp): void {
  const old = proposedMatches(s);
  const format = s.settings.format;

  // Pinned (manual / edited) matches keep their slot; drop players who are no longer waiting.
  const pinnedAt = new Map<number, Match>();
  old.forEach((m, i) => {
    if (m.locked.length === 0) return;
    for (const id of matchPlayers(m)) if (s.players[id]?.status !== "waiting") removeFromMatch(m, id);
    if (m.locked.length > 0) pinnedAt.set(i, m);
  });

  const used = new Set<PlayerId>();
  for (const m of pinnedAt.values()) matchPlayers(m).forEach((id) => used.add(id));
  let pool = rankWaiting(s, used);

  const take = (ids: PlayerId[]) => {
    const drop = new Set(ids);
    pool = pool.filter((p) => !drop.has(p.id));
  };

  const out: Match[] = [];
  const target = horizon(s);
  const lastPinned = Math.max(-1, ...pinnedAt.keys());
  for (let i = 0; out.length < target || i <= lastPinned; i++) {
    const pinned = pinnedAt.get(i);
    if (pinned) {
      fillVacancies(pinned, pool, take);
      out.push(pinned);
      continue;
    }
    if (out.length >= target) continue;
    const pick = pickNext(s, pool, format);
    if (!pick) {
      if (i > lastPinned) break;
      continue;
    }
    const ids = [...pick.teamA, ...pick.teamB];
    take(ids);
    const reuse = old.find((m) => m.locked.length === 0 && sameSet(matchPlayers(m), ids));
    out.push(
      newMatch(s, at, {
        id: reuse?.id,
        createdAt: reuse?.createdAt ?? at,
        format,
        teamA: pick.teamA,
        teamB: pick.teamB,
      }),
    );
  }

  s.matches = [...s.matches.filter((m) => m.status !== "proposed"), ...out];
}

/** Fill empty seats strictly from the front of the queue. */
function fillVacancies(m: Match, pool: SessionPlayer[], take: (ids: PlayerId[]) => void) {
  const size = teamSize(m.format);
  const added: PlayerId[] = [];
  for (const team of [m.teamA, m.teamB]) {
    while (team.length < size) {
      const next = pool.find((p) => !added.includes(p.id));
      if (!next) return take(added);
      team.push(next.id);
      added.push(next.id);
    }
  }
  take(added);
}

interface Lineup {
  teamA: PlayerId[];
  teamB: PlayerId[];
}

function pickNext(s: SessionState, pool: SessionPlayer[], format: Format, fixed: SessionPlayer[] = []): Lineup | null {
  const size = teamSize(format) * 2;
  const base = { settings: s.settings, pairHistory: s.pairHistory, format };
  let ranked = pool;

  if (s.settings.queueMode === "stack" && fixed.length === 0 && pool.length > 0) {
    // Complete groups that fill a court queue as one unit.
    const groups = new Map<string, SessionPlayer[]>();
    for (const p of pool) if (p.groupId) groups.set(p.groupId, [...(groups.get(p.groupId) ?? []), p]);
    const ready = [...groups.values()].filter((g) => g.length === size);
    const anchorGroup = ready.find((g) => g.some((p) => p.id === pool[0]!.id));
    if (anchorGroup) {
      const ctx = { weights: s.settings.weights, maxConsecutive: null, pairHistory: s.pairHistory, available: new Set<PlayerId>() };
      const split = bestSplit(ctx, anchorGroup);
      return split && { teamA: split.teamA.map((p) => p.id), teamB: split.teamB.map((p) => p.id) };
    }
    const grouped = new Set(ready.flat().map((p) => p.id));
    ranked = pool.filter((p) => !grouped.has(p.id));
  }

  const pick = pickMatch({ ...base, ranked, fixed, keepFixedTogether: fixed.length > 0 });
  return pick && { teamA: pick.teamA.map((p) => p.id), teamB: pick.teamB.map((p) => p.id) };
}

/** Put the next proposed match on every free, active court. */
function autoCall(s: SessionState, at: Timestamp): boolean {
  let called = false;
  for (const court of s.courts) {
    if (!court.active || courtMatch(s, court.id)) continue;
    const fmt = courtFormat(s, court);
    const queue = proposedMatches(s).filter((m) => m.format === fmt && isFull(m));
    const next = queue.find((m) => m.courtId === court.id) ?? queue.find((m) => m.courtId === null);
    if (!next) continue;
    callMatch(s, next, court.id, at);
    called = true;
  }
  return called;
}

/** Bring the session to a stable state after any change. */
function settle(s: SessionState, at: Timestamp) {
  regenerate(s, at);
  if (s.settings.autoCall && autoCall(s, at)) regenerate(s, at);
}

// ---------------------------------------------------------------------------
// Command handlers
// ---------------------------------------------------------------------------

function completeMatch(s: SessionState, m: Match, scoreA: number, scoreB: number, at: Timestamp) {
  if (!isLive(m)) throw new EngineError("Only a called or live match can be completed.", "invalid_state");
  if (scoreA === scoreB) throw new EngineError("A match can't end in a tie.", "invalid_input");
  if (scoreA < 0 || scoreB < 0) throw new EngineError("Scores can't be negative.", "invalid_input");
  if (!isFull(m)) throw new EngineError("The match has an empty seat.", "invalid_state");

  const winner: Team = scoreA > scoreB ? "A" : "B";
  m.status = "completed";
  m.endedAt = at;
  m.startedAt ??= m.calledAt ?? at;
  m.result = { scoreA, scoreB, winner };

  const update = (ids: PlayerId[], won: boolean, pf: number, pa: number) => {
    for (const id of ids) {
      const p = s.players[id];
      if (!p) continue;
      p.gamesPlayed += 1;
      p.lastPlayedAt = at;
      p.consecutiveGames = p.satOut ? 1 : p.consecutiveGames + 1;
      p.satOut = false;
      p.pointsFor += pf;
      p.pointsAgainst += pa;
      if (won) p.wins += 1;
      else p.losses += 1;
      if (p.status === "playing" || p.status === "called") p.status = "waiting";
    }
  };
  update(m.teamA, winner === "A", scoreA, scoreB);
  update(m.teamB, winner === "B", scoreB, scoreA);

  const bump = (a: PlayerId, b: PlayerId, rel: "partner" | "opponent") => {
    const k = pairKey(a, b);
    const cur = s.pairHistory[k] ?? { partner: 0, opponent: 0 };
    s.pairHistory[k] = { ...cur, [rel]: cur[rel] + 1 };
  };
  for (const team of [m.teamA, m.teamB])
    for (let i = 0; i < team.length; i++) for (let j = i + 1; j < team.length; j++) bump(team[i]!, team[j]!, "partner");
  for (const a of m.teamA) for (const b of m.teamB) bump(a, b, "opponent");

  if (s.settings.queueMode === "winners_stay" && m.courtId) winnersStay(s, m, winner, at);
}

function winnersStay(s: SessionState, done: Match, winner: Team, at: Timestamp) {
  const court = s.courts.find((c) => c.id === done.courtId);
  if (!court?.active || courtMatch(s, court.id)) return;
  const winners = (winner === "A" ? done.teamA : done.teamB).map((id) => s.players[id]!);
  const cap = s.settings.maxConsecutive;
  if (cap !== null && winners.some((p) => p.consecutiveGames >= cap)) return;

  const winnerIds = new Set(winners.map((p) => p.id));
  const pool = rankWaiting(s, winnerIds).filter((p) => !findMatchOf(s, p.id, ["proposed"])?.locked.includes(p.id));
  const lineup = pickNext(s, pool, done.format, winners);
  if (!lineup) return;
  const ids = [...lineup.teamA, ...lineup.teamB];
  for (const id of ids) {
    const pm = findMatchOf(s, id, ["proposed"]);
    if (pm) removeFromMatch(pm, id);
  }
  const m = newMatch(s, at, { format: done.format, teamA: lineup.teamA, teamB: lineup.teamB, source: "auto" });
  s.matches.push(m);
  callMatch(s, m, court.id, at);
}

function describe(s: SessionState, cmd: Command): string {
  const name = (id: PlayerId) => s.players[id]?.name ?? id;
  const names = (ids: PlayerId[]) => ids.map(name).join(" & ");
  switch (cmd.type) {
    case "AddPlayer":
      return `${cmd.player.name} checked in`;
    case "RemovePlayer":
      return `${name(cmd.playerId)} left`;
    case "UpdatePlayer":
      return `${name(cmd.playerId)} updated`;
    case "SetRest":
      return `${name(cmd.playerId)} is resting`;
    case "SetAway":
      return `${name(cmd.playerId)} is away`;
    case "ReturnPlayer":
      return `${name(cmd.playerId)} is back`;
    case "SetPartnerRequest":
      return cmd.partnerId ? `${name(cmd.playerId)} wants to play with ${name(cmd.partnerId)}` : `${name(cmd.playerId)} cleared partner request`;
    case "SetGroup":
      return cmd.groupId ? `Group: ${names(cmd.playerIds)}` : `Ungrouped ${names(cmd.playerIds)}`;
    case "AddCourt":
      return `Added ${cmd.court.name}`;
    case "DisableCourt":
      return `Disabled ${s.courts.find((c) => c.id === cmd.courtId)?.name ?? cmd.courtId}`;
    case "EnableCourt":
      return `Enabled ${s.courts.find((c) => c.id === cmd.courtId)?.name ?? cmd.courtId}`;
    case "CreateMatch":
      return `Created match ${names(cmd.teamA)} vs ${names(cmd.teamB)}`;
    case "EditMatch":
      return `Edited match: ${names(cmd.teamA)} vs ${names(cmd.teamB)}`;
    case "FillVacancies":
      return "Filled empty seats";
    case "CancelMatch":
      return "Cancelled a match";
    case "CallMatch":
      return `Called match to ${s.courts.find((c) => c.id === cmd.courtId)?.name ?? cmd.courtId}`;
    case "StartMatch":
      return "Match started";
    case "RecordScoreEvent":
      return `Score: ${cmd.event.type}`;
    case "CompleteMatch":
      return `Final ${cmd.scoreA}–${cmd.scoreB}`;
    case "UpdateSettings":
      return "Settings changed";
    case "Regenerate":
      return "Queue regenerated";
  }
}

/**
 * The single entry point: `nextState = applyCommand(state, command)`.
 * Pure: never mutates `state`, never reads the clock. Throws EngineError on invalid commands.
 */
export function applyCommand(state: SessionState, cmd: Command): SessionState {
  const s = clone(state);
  const at = cmd.at;
  const summary = describe(state, cmd);

  switch (cmd.type) {
    case "AddPlayer": {
      const existing = s.players[cmd.player.id];
      if (existing && existing.status !== "left") throw new EngineError(`${existing.name} is already checked in.`, "conflict");
      if (existing) {
        existing.status = "waiting";
        break;
      }
      s.players[cmd.player.id] = {
        id: cmd.player.id,
        name: cmd.player.name.trim(),
        skill: cmd.player.skill ?? 3.0,
        status: "waiting",
        checkedInAt: at,
        lastPlayedAt: null,
        gamesPlayed: 0,
        gamesCredit: s.settings.lateArrivalRule ? lateArrivalCredit(s) : 0,
        consecutiveGames: 0,
        satOut: true,
        priorityBoost: 0,
        seq: s.nextSeq++,
        partnerRequestId: null,
        groupId: null,
        wins: 0,
        losses: 0,
        pointsFor: 0,
        pointsAgainst: 0,
      };
      break;
    }
    case "RemovePlayer":
    case "SetRest":
    case "SetAway": {
      const p = getPlayer(s, cmd.playerId);
      detach(s, p.id);
      p.status = cmd.type === "RemovePlayer" ? "left" : cmd.type === "SetRest" ? "resting" : "away";
      if (cmd.type === "RemovePlayer") {
        for (const q of Object.values(s.players)) if (q.partnerRequestId === p.id) q.partnerRequestId = null;
      }
      break;
    }
    case "ReturnPlayer": {
      const p = getPlayer(s, cmd.playerId);
      if (p.status === "waiting" || p.status === "called" || p.status === "playing") break;
      // Priority fields are untouched, so the player keeps their place.
      p.status = "waiting";
      break;
    }
    case "UpdatePlayer": {
      const p = getPlayer(s, cmd.playerId);
      if (cmd.name !== undefined) p.name = cmd.name.trim();
      if (cmd.skill !== undefined) p.skill = cmd.skill;
      if (cmd.priorityBoost !== undefined) p.priorityBoost = cmd.priorityBoost;
      break;
    }
    case "SetPartnerRequest": {
      const p = getPlayer(s, cmd.playerId);
      if (cmd.partnerId) getPlayer(s, cmd.partnerId);
      if (cmd.partnerId === p.id) throw new EngineError("A player can't partner with themselves.", "invalid_input");
      p.partnerRequestId = cmd.partnerId;
      break;
    }
    case "SetGroup": {
      for (const id of cmd.playerIds) getPlayer(s, id).groupId = cmd.groupId;
      break;
    }
    case "AddCourt": {
      if (s.courts.some((c) => c.id === cmd.court.id)) throw new EngineError("Court already exists.", "conflict");
      s.courts.push({ id: cmd.court.id, name: cmd.court.name, active: true, format: cmd.court.format ?? null });
      break;
    }
    case "DisableCourt": {
      const court = getCourt(s, cmd.courtId);
      court.active = false;
      const m = courtMatch(s, court.id);
      if (m?.status === "called") {
        // Not started yet: send it back to the front of the line, lineup intact.
        m.status = "proposed";
        m.courtId = null;
        m.calledAt = null;
        m.locked = matchPlayers(m);
        setStatus(s, matchPlayers(m), "waiting");
        s.matches = [m, ...s.matches.filter((x) => x.id !== m.id)];
      }
      break;
    }
    case "EnableCourt": {
      getCourt(s, cmd.courtId).active = true;
      break;
    }
    case "CreateMatch": {
      if (s.matches.some((m) => m.id === cmd.matchId)) throw new EngineError("Match id already used.", "conflict");
      const court = cmd.courtId ? getCourt(s, cmd.courtId) : null;
      const format = court ? courtFormat(s, court) : s.settings.format;
      validateTeams(format, cmd.teamA, cmd.teamB);
      const ids = [...cmd.teamA, ...cmd.teamB];
      if (ids.length === 0) throw new EngineError("Pick at least one player.", "invalid_input");
      assertAvailable(s, ids);
      for (const id of ids) detach(s, id);
      const m = newMatch(s, at, {
        id: cmd.matchId,
        source: "manual",
        format,
        teamA: [...cmd.teamA],
        teamB: [...cmd.teamB],
        locked: ids,
        courtId: court?.id ?? null,
      });
      // Manual matches go to the front of the upcoming list.
      const firstProposed = s.matches.findIndex((x) => x.status === "proposed");
      if (firstProposed === -1) s.matches.push(m);
      else s.matches.splice(firstProposed, 0, m);
      // The organizer picked a free court: put it on right away.
      if (court?.active && !courtMatch(s, court.id) && isFull(m)) callMatch(s, m, court.id, at);
      break;
    }
    case "EditMatch": {
      const m = getMatch(s, cmd.matchId);
      if (m.status !== "proposed" && m.status !== "called") {
        throw new EngineError("Only upcoming or called matches can be edited.", "invalid_state");
      }
      let format = m.format;
      if (cmd.courtId !== undefined && cmd.courtId !== m.courtId) {
        if (cmd.courtId === null) {
          if (m.status === "called") throw new EngineError("A called match needs a court.", "invalid_input");
        } else {
          const court = getCourt(s, cmd.courtId);
          const busy = courtMatch(s, court.id);
          if (m.status === "called" && (!court.active || (busy && busy.id !== m.id))) {
            throw new EngineError(`${court.name} isn't free.`, "invalid_state");
          }
          format = courtFormat(s, court);
        }
        m.courtId = cmd.courtId;
      }
      validateTeams(format, cmd.teamA, cmd.teamB);
      const before = matchPlayers(m);
      const after = [...cmd.teamA, ...cmd.teamB];
      assertAvailable(s, after.filter((id) => !before.includes(id)), m.id);
      // Newly added players leave whatever proposed match they were in.
      for (const id of after) if (!before.includes(id)) detach(s, id);
      // Displaced players go back to waiting with their ORIGINAL priority.
      const displaced = before.filter((id) => !after.includes(id));
      setStatus(s, displaced, "waiting");
      m.teamA = [...cmd.teamA];
      m.teamB = [...cmd.teamB];
      m.format = format;
      m.locked = after;
      m.source = m.source === "manual" ? "manual" : "edited";
      if (m.status === "called") setStatus(s, after, "called");
      break;
    }
    case "FillVacancies": {
      const m = getMatch(s, cmd.matchId);
      if (m.status !== "called" && m.status !== "proposed") throw new EngineError("Nothing to fill.", "invalid_state");
      const inOtherPinned = new Set(
        proposedMatches(s).filter((x) => x.id !== m.id && x.locked.length > 0).flatMap(matchPlayers),
      );
      let pool = rankWaiting(s, new Set([...inOtherPinned, ...matchPlayers(m)]));
      const before = new Set(matchPlayers(m));
      fillVacancies(m, pool, (ids) => {
        pool = pool.filter((p) => !ids.includes(p.id));
      });
      const added = matchPlayers(m).filter((id) => !before.has(id));
      for (const id of added) {
        const pm = findMatchOf(s, id, ["proposed"]);
        if (pm && pm.id !== m.id) removeFromMatch(pm, id);
      }
      m.locked = [...new Set([...m.locked, ...added])];
      if (m.status === "called") setStatus(s, added, "called");
      break;
    }
    case "CancelMatch": {
      const m = getMatch(s, cmd.matchId);
      if (m.status === "completed" || m.status === "cancelled") throw new EngineError("Match already finished.", "invalid_state");
      // Players keep their priority: nothing about their history changes.
      setStatus(
        s,
        matchPlayers(m).filter((id) => s.players[id]?.status === "called" || s.players[id]?.status === "playing"),
        "waiting",
      );
      if (m.status === "proposed") s.matches = s.matches.filter((x) => x.id !== m.id);
      else {
        m.status = "cancelled";
        m.endedAt = at;
      }
      break;
    }
    case "CallMatch": {
      const m = getMatch(s, cmd.matchId);
      if (m.status !== "proposed") throw new EngineError("Only an upcoming match can be called.", "invalid_state");
      const court = getCourt(s, cmd.courtId);
      if (!court.active) throw new EngineError(`${court.name} is disabled.`, "invalid_state");
      if (courtMatch(s, court.id)) throw new EngineError(`${court.name} is busy.`, "invalid_state");
      if (!isFull(m)) throw new EngineError("The match has an empty seat.", "invalid_state");
      callMatch(s, m, court.id, at);
      break;
    }
    case "StartMatch": {
      const m = getMatch(s, cmd.matchId);
      if (m.status !== "called") throw new EngineError("Only a called match can start.", "invalid_state");
      if (!isFull(m)) throw new EngineError("The match has an empty seat.", "invalid_state");
      m.status = "in_progress";
      m.startedAt = at;
      setStatus(s, matchPlayers(m), "playing");
      break;
    }
    case "RecordScoreEvent": {
      const m = getMatch(s, cmd.matchId);
      if (!isLive(m)) throw new EngineError("Match isn't on court.", "invalid_state");
      if (m.status === "called") {
        if (!isFull(m)) throw new EngineError("The match has an empty seat.", "invalid_state");
        m.status = "in_progress";
        m.startedAt = at;
        setStatus(s, matchPlayers(m), "playing");
      }
      m.scoreEvents.push(cmd.event);
      break;
    }
    case "CompleteMatch": {
      completeMatch(s, getMatch(s, cmd.matchId), cmd.scoreA, cmd.scoreB, at);
      break;
    }
    case "UpdateSettings": {
      const { weights, scoring, ...rest } = cmd.settings;
      const modeChanged = rest.queueMode && rest.queueMode !== s.settings.queueMode;
      s.settings = {
        ...s.settings,
        ...rest,
        weights: { ...(modeChanged ? MODE_WEIGHTS[rest.queueMode!] : s.settings.weights), ...weights },
        scoring: { ...s.settings.scoring, ...scoring },
      };
      if (rest.format && rest.format !== state.settings.format) {
        // Upcoming matches in the old format are no longer valid.
        s.matches = s.matches.filter((m) => m.status !== "proposed");
      }
      break;
    }
    case "Regenerate": {
      // Unpin everything upcoming and rebuild from scratch.
      s.matches = s.matches.filter((m) => m.status !== "proposed");
      break;
    }
  }

  settle(s, at);
  s.version += 1;
  s.log = [...s.log, { version: s.version, at, type: cmd.type, summary, actor: cmd.actor ?? null }].slice(-LOG_LIMIT);
  return s;
}

/** Convenience: current live score for a match. */
export function matchScore(state: SessionState, m: Match) {
  return replayScore(state.settings.scoring, m.scoreEvents, m.format === "doubles");
}
