import type { ScoreEvent, ScoringRules } from "./scoring/types";

export type PlayerId = string;
export type CourtId = string;
export type MatchId = string;

/** Epoch milliseconds. Always supplied by the caller so the engine stays pure. */
export type Timestamp = number;

export type Team = "A" | "B";

export type QueueMode =
  /** First come, first served: whoever has waited longest plays next. */
  | "fifo"
  /** Fewest games played first, then longest wait. Recommended default. */
  | "fair"
  /** Fair rotation, but strongly prefers foursomes within a skill band. */
  | "skill"
  /** Winners stay on court (up to a cap); challengers come from the queue. */
  | "winners_stay"
  /** Pre-formed groups ("paddle stack") queue together as a unit. */
  | "stack";

export type Format = "doubles" | "singles";

export type PlayerStatus =
  | "waiting"
  | "called"
  | "playing"
  | "resting"
  | "away"
  | "left";

export interface SessionPlayer {
  id: PlayerId;
  name: string;
  /** Self-rated skill, 2.0 – 5.0. */
  skill: number;
  status: PlayerStatus;
  checkedInAt: Timestamp;
  /** When the player last came off court (null = never played this session). */
  lastPlayedAt: Timestamp | null;
  /** Real games played this session (used for stats). */
  gamesPlayed: number;
  /**
   * Late-arrival credit: extra "virtual" games so a newcomer does not jump
   * ahead of people who have been waiting. Priority uses gamesPlayed + credit.
   */
  gamesCredit: number;
  /** Games played back-to-back without sitting out a rotation. */
  consecutiveGames: number;
  /** True once a match was called without this player since their last game. */
  satOut: boolean;
  /** Organizer boost: each point counts as one fewer game played. */
  priorityBoost: number;
  /** Monotonic check-in order, used as the final deterministic tie-breaker. */
  seq: number;
  /** Partner request ("play together"). Mutual requests are honoured more strongly. */
  partnerRequestId: PlayerId | null;
  /** Group id for paddle-stack mode. */
  groupId: string | null;
  /** Checked out while on court: leaves as soon as the current game ends. */
  leaveAfterMatch?: boolean;
  wins: number;
  losses: number;
  pointsFor: number;
  pointsAgainst: number;
}

export interface Court {
  id: CourtId;
  name: string;
  active: boolean;
  /** Per-court format override (e.g. a singles court). */
  format: Format | null;
}

export type MatchStatus =
  | "proposed"
  | "called"
  | "in_progress"
  | "completed"
  | "cancelled";

export type MatchSource = "auto" | "manual" | "edited";

export interface MatchResult {
  scoreA: number;
  scoreB: number;
  winner: Team;
}

export interface Match {
  id: MatchId;
  courtId: CourtId | null;
  status: MatchStatus;
  source: MatchSource;
  format: Format;
  teamA: PlayerId[];
  teamB: PlayerId[];
  /** Players pinned by the organizer; auto-adjustment never moves them. */
  locked: PlayerId[];
  createdAt: Timestamp;
  calledAt: Timestamp | null;
  startedAt: Timestamp | null;
  endedAt: Timestamp | null;
  result: MatchResult | null;
  scoreEvents: ScoreEvent[];
}

export interface PairStats {
  partner: number;
  opponent: number;
}

export interface QueueWeights {
  /** Penalty per skill point of spread within the foursome. */
  skillSpread: number;
  /** Penalty per skill point difference between the two teams. */
  teamBalance: number;
  repeatPartner: number;
  repeatOpponent: number;
  /** Penalty per queue position skipped over (protects people who waited). */
  rankSkipped: number;
  /** Penalty for exceeding the max-consecutive-games cap. */
  consecutive: number;
  /** Penalty for splitting a requested partner pair. */
  partnerRequest: number;
}

export interface SessionSettings {
  queueMode: QueueMode;
  format: Format;
  /** Proposed matches kept in the look-ahead, per active court. */
  lookAheadPerCourt: number;
  /** How many queued players the match-maker considers beyond the anchor. */
  candidatePool: number;
  /** Cap on back-to-back games (winners-stay cap too). null = unlimited. */
  maxConsecutive: number | null;
  /** Automatically call the next proposed match when a court frees up. */
  autoCall: boolean;
  /** Apply the late-arrival rule to newcomers. */
  lateArrivalRule: boolean;
  /** Default match duration used for ETAs until real data exists. */
  defaultMatchMinutes: number;
  scoring: ScoringRules;
  weights: QueueWeights;
}

export interface AuditEntry {
  version: number;
  at: Timestamp;
  type: Command["type"] | "Undo";
  summary: string;
  actor: string | null;
}

export interface SessionState {
  id: string;
  name: string;
  joinCode: string;
  createdAt: Timestamp;
  /** Incremented on every accepted command (optimistic concurrency). */
  version: number;
  settings: SessionSettings;
  courts: Court[];
  players: Record<PlayerId, SessionPlayer>;
  /** Ordered: proposed matches appear in queue order. */
  matches: Match[];
  /** Keyed by pairKey(a, b). */
  pairHistory: Record<string, PairStats>;
  nextSeq: number;
  log: AuditEntry[];
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

type Base = { at: Timestamp; actor?: string | null };

export type Command =
  | (Base & {
      type: "AddPlayer";
      player: { id: PlayerId; name: string; skill?: number };
    })
  | (Base & { type: "AddPlayers"; players: { id: PlayerId; name: string; skill?: number }[] })
  /** Check out. A player mid-game is checked out when that game ends. */
  | (Base & { type: "RemovePlayer"; playerId: PlayerId })
  | (Base & { type: "UpdatePlayer"; playerId: PlayerId; name?: string; skill?: number; priorityBoost?: number })
  | (Base & { type: "SetRest"; playerId: PlayerId })
  | (Base & { type: "SetAway"; playerId: PlayerId })
  | (Base & { type: "ReturnPlayer"; playerId: PlayerId })
  | (Base & { type: "SetPartnerRequest"; playerId: PlayerId; partnerId: PlayerId | null })
  | (Base & { type: "SetGroup"; playerIds: PlayerId[]; groupId: string | null })
  | (Base & { type: "AddCourt"; court: { id: CourtId; name: string; format?: Format | null } })
  | (Base & { type: "RenameCourt"; courtId: CourtId; name: string })
  | (Base & { type: "DisableCourt"; courtId: CourtId })
  | (Base & { type: "EnableCourt"; courtId: CourtId })
  | (Base & {
      type: "CreateMatch";
      matchId: MatchId;
      teamA: PlayerId[];
      teamB: PlayerId[];
      courtId?: CourtId | null;
    })
  | (Base & {
      type: "EditMatch";
      matchId: MatchId;
      teamA: PlayerId[];
      teamB: PlayerId[];
      courtId?: CourtId | null;
    })
  | (Base & { type: "FillVacancies"; matchId: MatchId })
  | (Base & { type: "CancelMatch"; matchId: MatchId })
  | (Base & { type: "CallMatch"; matchId: MatchId; courtId: CourtId })
  | (Base & { type: "StartMatch"; matchId: MatchId })
  | (Base & { type: "RecordScoreEvent"; matchId: MatchId; event: ScoreEvent })
  | (Base & { type: "CompleteMatch"; matchId: MatchId; scoreA: number; scoreB: number })
  | (Base & { type: "UpdateSettings"; settings: Partial<Omit<SessionSettings, "weights" | "scoring">> & {
      weights?: Partial<QueueWeights>;
      scoring?: Partial<ScoringRules>;
    } })
  | (Base & { type: "Regenerate" });

export type CommandType = Command["type"];

export class EngineError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "not_found"
      | "invalid_state"
      | "invalid_input"
      | "conflict" = "invalid_state",
  ) {
    super(message);
    this.name = "EngineError";
  }
}
