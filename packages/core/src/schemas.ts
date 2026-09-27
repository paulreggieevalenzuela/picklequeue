import { z } from "zod";
import type { Command } from "./types";

const id = z.string().min(1).max(64);
const team = z.enum(["A", "B"]);
const base = { at: z.number().int().nonnegative(), actor: z.string().max(64).nullish() };
const format = z.enum(["doubles", "singles"]);

export const scoreEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("RALLY"), winner: team, at: z.number() }),
  z.object({ type: z.literal("TIMEOUT"), team, at: z.number() }),
  z.object({ type: z.literal("UNDO"), at: z.number() }),
  z.object({ type: z.literal("FINAL_OVERRIDE"), a: z.number().int().min(0), b: z.number().int().min(0), at: z.number() }),
]);

export const scoringRulesSchema = z.object({
  system: z.enum(["sideout", "rally"]),
  pointsToWin: z.number().int().min(1).max(50),
  winBy: z.number().int().min(1).max(5),
  cap: z.number().int().min(1).max(60).nullable(),
  bestOf: z.union([z.literal(1), z.literal(3), z.literal(5)]),
  switchSidesAt: z.number().int().min(1).nullable(),
  timeoutsPerGame: z.number().int().min(0).max(5),
});

const skill = z.number().min(1).max(8);
const teamIds = z.array(id).max(2);

export const commandSchema = z.discriminatedUnion("type", [
  z.object({ ...base, type: z.literal("AddPlayer"), player: z.object({ id, name: z.string().trim().min(1).max(40), skill: skill.optional() }) }),
  z.object({
    ...base,
    type: z.literal("AddPlayers"),
    players: z.array(z.object({ id, name: z.string().trim().min(1).max(40), skill: skill.optional() })).min(1).max(100),
  }),
  z.object({ ...base, type: z.literal("RemovePlayer"), playerId: id }),
  z.object({
    ...base,
    type: z.literal("UpdatePlayer"),
    playerId: id,
    name: z.string().trim().min(1).max(40).optional(),
    skill: skill.optional(),
    priorityBoost: z.number().min(-10).max(10).optional(),
  }),
  z.object({ ...base, type: z.literal("SetRest"), playerId: id }),
  z.object({ ...base, type: z.literal("SetAway"), playerId: id }),
  z.object({ ...base, type: z.literal("ReturnPlayer"), playerId: id }),
  z.object({ ...base, type: z.literal("SetPartnerRequest"), playerId: id, partnerId: id.nullable() }),
  z.object({ ...base, type: z.literal("SetGroup"), playerIds: z.array(id).min(1).max(4), groupId: id.nullable() }),
  z.object({ ...base, type: z.literal("AddCourt"), court: z.object({ id, name: z.string().min(1).max(30), format: format.nullish() }) }),
  z.object({ ...base, type: z.literal("RenameCourt"), courtId: id, name: z.string().trim().min(1).max(30) }),
  z.object({ ...base, type: z.literal("DisableCourt"), courtId: id }),
  z.object({ ...base, type: z.literal("EnableCourt"), courtId: id }),
  z.object({ ...base, type: z.literal("CreateMatch"), matchId: id, teamA: teamIds, teamB: teamIds, courtId: id.nullish() }),
  z.object({ ...base, type: z.literal("EditMatch"), matchId: id, teamA: teamIds, teamB: teamIds, courtId: id.nullish() }),
  z.object({ ...base, type: z.literal("FillVacancies"), matchId: id }),
  z.object({ ...base, type: z.literal("CancelMatch"), matchId: id }),
  z.object({ ...base, type: z.literal("CallMatch"), matchId: id, courtId: id }),
  z.object({ ...base, type: z.literal("StartMatch"), matchId: id }),
  z.object({ ...base, type: z.literal("RecordScoreEvent"), matchId: id, event: scoreEventSchema }),
  z.object({ ...base, type: z.literal("CompleteMatch"), matchId: id, scoreA: z.number().int().min(0), scoreB: z.number().int().min(0) }),
  z.object({
    ...base,
    type: z.literal("UpdateSettings"),
    settings: z
      .object({
        queueMode: z.enum(["fifo", "fair", "skill", "winners_stay", "stack"]),
        format,
        lookAheadPerCourt: z.number().int().min(1).max(5),
        candidatePool: z.number().int().min(3).max(12),
        maxConsecutive: z.number().int().min(1).max(10).nullable(),
        autoCall: z.boolean(),
        lateArrivalRule: z.boolean(),
        defaultMatchMinutes: z.number().int().min(3).max(60),
        scoring: scoringRulesSchema.partial(),
        weights: z.record(z.string(), z.number().min(0).max(1000)),
      })
      .partial(),
  }),
  z.object({ ...base, type: z.literal("Regenerate") }),
]);

/** Validate untrusted input (API body, realtime message) into a Command. */
export function parseCommand(input: unknown): Command {
  return commandSchema.parse(input) as Command;
}

/** Body of POST /sessions/:id/commands. */
export const commandEnvelopeSchema = z.object({
  expectedVersion: z.number().int().nonnegative(),
  command: commandSchema,
});
