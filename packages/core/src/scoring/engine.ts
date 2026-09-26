import type { GameScore, ScoreEvent, ScoreState, ScoringRules } from "./types";

type Side = "A" | "B";

export const DEFAULT_SCORING_RULES: ScoringRules = {
  system: "sideout",
  pointsToWin: 11,
  winBy: 2,
  cap: null,
  bestOf: 1,
  switchSidesAt: 6,
  timeoutsPerGame: 2,
};

export const SCORING_PRESETS: Record<string, ScoringRules> = {
  "Traditional to 11": DEFAULT_SCORING_RULES,
  "Traditional to 15": { ...DEFAULT_SCORING_RULES, pointsToWin: 15, switchSidesAt: 8 },
  "Rally to 21": { ...DEFAULT_SCORING_RULES, system: "rally", pointsToWin: 21, switchSidesAt: 11 },
  "Rally to 15": { ...DEFAULT_SCORING_RULES, system: "rally", pointsToWin: 15, switchSidesAt: 8 },
  "Best of 3 to 11": { ...DEFAULT_SCORING_RULES, bestOf: 3 },
};

const other = (t: Side): Side => (t === "A" ? "B" : "A");

/** Doubles side-out games start on the second server ("0-0-2"). */
function openingServer(rules: ScoringRules, doubles: boolean): 1 | 2 {
  return rules.system === "sideout" && doubles ? 2 : 1;
}

export function initialScoreState(rules: ScoringRules, doubles = true): ScoreState {
  return {
    rules,
    doubles,
    games: [],
    gameNumber: 1,
    a: 0,
    b: 0,
    servingTeam: "A",
    serverNumber: openingServer(rules, doubles),
    gamesWon: { A: 0, B: 0 },
    timeoutsUsed: { A: 0, B: 0 },
    sideSwitchDue: false,
    switchedThisGame: false,
    gamePoint: null,
    matchPoint: null,
    finished: false,
    winner: null,
    rallies: 0,
    effectiveEvents: [],
  };
}

function gamesNeeded(rules: ScoringRules): number {
  return Math.floor(rules.bestOf / 2) + 1;
}

export function isGameWon(rules: ScoringRules, mine: number, theirs: number): boolean {
  if (rules.cap !== null && mine >= rules.cap) return true;
  return mine >= rules.pointsToWin && mine - theirs >= rules.winBy;
}

function isDecidingGame(s: ScoreState): boolean {
  const need = gamesNeeded(s.rules);
  return s.gamesWon.A === need - 1 && s.gamesWon.B === need - 1;
}

/** Could `team` win the current game by scoring the next point? */
function canWinOnNextPoint(s: ScoreState, team: Side): boolean {
  const mine = team === "A" ? s.a : s.b;
  const theirs = team === "A" ? s.b : s.a;
  // In side-out scoring only the serving team can score.
  if (s.rules.system === "sideout" && s.servingTeam !== team) return false;
  return isGameWon(s.rules, mine + 1, theirs);
}

function withDerived(s: ScoreState): ScoreState {
  if (s.finished) return { ...s, gamePoint: null, matchPoint: null };
  const gamePoint: Side | null = canWinOnNextPoint(s, "A") ? "A" : canWinOnNextPoint(s, "B") ? "B" : null;
  const need = gamesNeeded(s.rules);
  const matchPoint = gamePoint && s.gamesWon[gamePoint] === need - 1 ? gamePoint : null;
  return { ...s, gamePoint, matchPoint };
}

function applyRally(prev: ScoreState, winner: Side): ScoreState {
  let s: ScoreState = { ...prev, sideSwitchDue: false, rallies: prev.rallies + 1 };
  const { rules } = s;

  if (rules.system === "rally") {
    if (winner === "A") s.a += 1;
    else s.b += 1;
    if (winner !== s.servingTeam) {
      s.servingTeam = winner;
      s.serverNumber = 1;
    }
  } else if (winner === s.servingTeam) {
    if (winner === "A") s.a += 1;
    else s.b += 1;
  } else if (s.doubles && s.serverNumber === 1) {
    s.serverNumber = 2;
  } else {
    s.servingTeam = other(s.servingTeam);
    s.serverNumber = 1;
  }

  // Switch ends mid-game (single game, or the deciding game of a series).
  if (
    rules.switchSidesAt !== null &&
    !s.switchedThisGame &&
    (rules.bestOf === 1 || isDecidingGame(s)) &&
    (s.a === rules.switchSidesAt || s.b === rules.switchSidesAt)
  ) {
    s.sideSwitchDue = true;
    s.switchedThisGame = true;
  }

  const gameWinner: Side | null = isGameWon(rules, s.a, s.b)
    ? "A"
    : isGameWon(rules, s.b, s.a)
      ? "B"
      : null;

  if (gameWinner) {
    const game: GameScore = { a: s.a, b: s.b, winner: gameWinner };
    const gamesWon = { ...s.gamesWon, [gameWinner]: s.gamesWon[gameWinner] + 1 };
    s = { ...s, games: [...s.games, game], gamesWon };
    if (gamesWon[gameWinner] >= gamesNeeded(rules)) {
      s.finished = true;
      s.winner = gameWinner;
    } else {
      // Next game: teams alternate who serves first and always switch ends.
      const starter: Side = s.gameNumber % 2 === 1 ? "B" : "A";
      s = {
        ...s,
        gameNumber: s.gameNumber + 1,
        a: 0,
        b: 0,
        servingTeam: starter,
        serverNumber: openingServer(rules, s.doubles),
        timeoutsUsed: { A: 0, B: 0 },
        sideSwitchDue: true,
        switchedThisGame: false,
      };
    }
  }
  return s;
}

function applyOne(s: ScoreState, e: ScoreEvent): ScoreState {
  switch (e.type) {
    case "RALLY":
      return s.finished ? s : applyRally(s, e.winner);
    case "TIMEOUT": {
      if (s.finished || s.timeoutsUsed[e.team] >= s.rules.timeoutsPerGame) return s;
      return { ...s, sideSwitchDue: false, timeoutsUsed: { ...s.timeoutsUsed, [e.team]: s.timeoutsUsed[e.team] + 1 } };
    }
    case "FINAL_OVERRIDE": {
      if (e.a === e.b || e.a < 0 || e.b < 0) return s;
      const winner: Side = e.a > e.b ? "A" : "B";
      return {
        ...s,
        games: [{ a: e.a, b: e.b, winner }],
        gamesWon: { A: winner === "A" ? 1 : 0, B: winner === "B" ? 1 : 0 },
        a: e.a,
        b: e.b,
        finished: true,
        winner,
        sideSwitchDue: false,
      };
    }
    case "UNDO":
      return s; // handled by resolveUndos
  }
}

/** Collapse UNDO events so replay only sees the events that still stand. */
export function resolveUndos(events: ScoreEvent[]): ScoreEvent[] {
  const out: ScoreEvent[] = [];
  for (const e of events) {
    if (e.type === "UNDO") out.pop();
    else out.push(e);
  }
  return out;
}

/** Replay a match's score from its event log. Pure and deterministic. */
export function replayScore(rules: ScoringRules, events: ScoreEvent[], doubles = true): ScoreState {
  const effective = resolveUndos(events);
  let s = initialScoreState(rules, doubles);
  for (const e of effective) s = applyOne(s, e);
  return withDerived({ ...s, effectiveEvents: effective });
}

/**
 * Referee call-out, from the serving team's perspective.
 * Doubles side-out: "4-2-1" (server score, receiver score, server number).
 */
export function callout(s: ScoreState): string {
  const serving = s.servingTeam === "A" ? s.a : s.b;
  const receiving = s.servingTeam === "A" ? s.b : s.a;
  if (s.rules.system === "sideout" && s.doubles) return `${serving}-${receiving}-${s.serverNumber}`;
  return `${serving}-${receiving}`;
}

/** Final totals for recording a result: single game = points, series = games won. */
export function finalScore(s: ScoreState): { a: number; b: number } | null {
  if (!s.finished) return null;
  if (s.games.length === 1) return { a: s.games[0]!.a, b: s.games[0]!.b };
  return { a: s.gamesWon.A, b: s.gamesWon.B };
}
