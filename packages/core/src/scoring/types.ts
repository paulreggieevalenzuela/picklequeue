export type ScoringSystem = "sideout" | "rally";

export interface ScoringRules {
  system: ScoringSystem;
  /** 11, 15, 21 … */
  pointsToWin: number;
  winBy: number;
  /** Hard cap: first to this score wins regardless of margin. null = no cap. */
  cap: number | null;
  bestOf: 1 | 3 | 5;
  /** Switch ends when a team first reaches this score (single / deciding game). */
  switchSidesAt: number | null;
  timeoutsPerGame: number;
}

type TeamSide = "A" | "B";

export type ScoreEvent =
  /** A rally was won by `winner`. The engine derives points / side-outs from the rules. */
  | { type: "RALLY"; winner: TeamSide; at: number }
  | { type: "TIMEOUT"; team: TeamSide; at: number }
  /** Removes the most recent non-undo event. */
  | { type: "UNDO"; at: number }
  /** Quick-entry mode: record only the final score. */
  | { type: "FINAL_OVERRIDE"; a: number; b: number; at: number };

export interface GameScore {
  a: number;
  b: number;
  winner: TeamSide;
}

export interface ScoreState {
  rules: ScoringRules;
  doubles: boolean;
  /** Completed games. */
  games: GameScore[];
  /** 1-based index of the game in progress. */
  gameNumber: number;
  a: number;
  b: number;
  servingTeam: TeamSide;
  /** Doubles side-out scoring: 1st or 2nd server. Always 1 otherwise. */
  serverNumber: 1 | 2;
  gamesWon: { A: number; B: number };
  timeoutsUsed: { A: number; B: number };
  /** Set on the state right after a rally that requires the teams to switch ends. */
  sideSwitchDue: boolean;
  switchedThisGame: boolean;
  gamePoint: TeamSide | null;
  matchPoint: TeamSide | null;
  finished: boolean;
  winner: TeamSide | null;
  rallies: number;
  /** Events after undo has been applied. */
  effectiveEvents: ScoreEvent[];
}
