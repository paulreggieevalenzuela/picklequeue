import { DEFAULT_SCORING_RULES } from "../scoring/engine";
import type { QueueMode, QueueWeights, SessionSettings } from "../types";

const FAIR_WEIGHTS: QueueWeights = {
  skillSpread: 1,
  teamBalance: 2,
  repeatPartner: 3,
  repeatOpponent: 1,
  rankSkipped: 2.5,
  consecutive: 50,
  partnerRequest: 6,
};

export const MODE_WEIGHTS: Record<QueueMode, QueueWeights> = {
  fair: FAIR_WEIGHTS,
  // Strict order: skipping anyone costs more than any variety gain.
  fifo: { ...FAIR_WEIGHTS, rankSkipped: 1000, skillSpread: 0 },
  skill: { ...FAIR_WEIGHTS, skillSpread: 6, rankSkipped: 1.5 },
  winners_stay: FAIR_WEIGHTS,
  stack: FAIR_WEIGHTS,
};

export const QUEUE_MODE_LABELS: Record<QueueMode, string> = {
  fair: "Fair rotation",
  fifo: "First come, first served",
  skill: "Skill-balanced",
  winners_stay: "Winners stay",
  stack: "Paddle stack (groups)",
};

export function defaultSettings(mode: QueueMode = "fair"): SessionSettings {
  return {
    queueMode: mode,
    format: "doubles",
    lookAheadPerCourt: 2,
    candidatePool: 8,
    maxConsecutive: mode === "winners_stay" ? 2 : null,
    autoCall: true,
    lateArrivalRule: true,
    defaultMatchMinutes: 15,
    scoring: DEFAULT_SCORING_RULES,
    weights: MODE_WEIGHTS[mode],
  };
}
