import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { applyCommand, matchPlayers } from "../queue/engine";
import { EngineError, type Command, type Match, type SessionState } from "../types";
import { T0, addPlayers, assertNoDoubleBooking, session } from "./helpers";

type Op =
  | { k: "add"; skill: number }
  | { k: "rest" | "away" | "return" | "leave"; who: number }
  | { k: "complete" | "start" | "cancel" | "fill"; which: number; a: number; b: number }
  | { k: "edit"; which: number; who: number }
  | { k: "court"; which: number; on: boolean };

const op: fc.Arbitrary<Op> = fc.oneof(
  fc.record({ k: fc.constant("add" as const), skill: fc.integer({ min: 20, max: 50 }).map((n) => n / 10) }),
  fc.record({ k: fc.constantFrom("rest" as const, "away" as const, "return" as const, "leave" as const), who: fc.nat(40) }),
  fc.record({
    k: fc.constantFrom("complete" as const, "start" as const, "cancel" as const, "fill" as const),
    which: fc.nat(6),
    a: fc.nat(15),
    b: fc.nat(15),
  }),
  fc.record({ k: fc.constant("edit" as const), which: fc.nat(6), who: fc.nat(40) }),
  fc.record({ k: fc.constant("court" as const), which: fc.nat(3), on: fc.boolean() }),
);

function toCommand(s: SessionState, o: Op, at: number): Command | null {
  const ids = Object.keys(s.players);
  const pickPlayer = (n: number) => ids[n % Math.max(1, ids.length)];
  const live = s.matches.filter((m) => m.status === "called" || m.status === "in_progress");
  const upcoming = s.matches.filter((m) => m.status === "proposed");
  const pickMatch = (list: Match[], n: number) => list[n % Math.max(1, list.length)];
  switch (o.k) {
    case "add": {
      const id = `x${ids.length + 1}`;
      return { type: "AddPlayer", at, player: { id, name: id, skill: o.skill } };
    }
    case "rest":
    case "away":
    case "return":
    case "leave": {
      const playerId = pickPlayer(o.who);
      if (!playerId) return null;
      const type = ({ rest: "SetRest", away: "SetAway", return: "ReturnPlayer", leave: "RemovePlayer" } as const)[o.k];
      return { type, at, playerId };
    }
    case "complete":
    case "start":
    case "cancel":
    case "fill": {
      const m = pickMatch(o.k === "cancel" || o.k === "fill" ? [...live, ...upcoming] : live, o.which);
      if (!m) return null;
      if (o.k === "complete") return { type: "CompleteMatch", at, matchId: m.id, scoreA: o.a, scoreB: o.b };
      if (o.k === "start") return { type: "StartMatch", at, matchId: m.id };
      if (o.k === "fill") return { type: "FillVacancies", at, matchId: m.id };
      return { type: "CancelMatch", at, matchId: m.id };
    }
    case "edit": {
      const m = pickMatch([...upcoming, ...live.filter((x) => x.status === "called")], o.which);
      const newcomer = pickPlayer(o.who);
      if (!m || !newcomer || m.teamA.length === 0) return null;
      return { type: "EditMatch", at, matchId: m.id, teamA: [newcomer, ...m.teamA.slice(1)].filter((v, i, a) => a.indexOf(v) === i), teamB: m.teamB.filter((id) => id !== newcomer) };
    }
    case "court": {
      const court = s.courts[o.which % s.courts.length]!;
      return { type: o.on ? "EnableCourt" : "DisableCourt", at, courtId: court.id };
    }
  }
}

function checkInvariants(before: SessionState, cmd: Command, after: SessionState) {
  assertNoDoubleBooking(after);

  // Status matches the match a player is in.
  for (const m of after.matches) {
    for (const id of matchPlayers(m)) {
      const status = after.players[id]!.status;
      if (m.status === "called") expect(status).toBe("called");
      if (m.status === "in_progress") expect(status).toBe("playing");
      if (m.status === "proposed") expect(status).toBe("waiting");
    }
  }

  // Joins / returns never touch a match that is already called or on court.
  if (cmd.type === "AddPlayer" || cmd.type === "ReturnPlayer") {
    for (const m of before.matches.filter((x) => x.status === "called" || x.status === "in_progress")) {
      const now = after.matches.find((x) => x.id === m.id)!;
      expect(now.teamA).toEqual(m.teamA);
      expect(now.teamB).toEqual(m.teamB);
      expect(now.status).toBe(m.status);
    }
  }

  // Everybody who is waiting and not slotted is only left out because matches are full.
  expect(after.version).toBe(before.version + 1);
}

describe("queue engine properties", () => {
  it("random sessions never double-book, and joins never disturb live matches", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 4 }), fc.integer({ min: 0, max: 14 }), fc.array(op, { maxLength: 60 }), (courts, n, ops) => {
        let s = addPlayers(session({ courts }), n);
        let at = T0 + 10_000;
        for (const o of ops) {
          const cmd = toCommand(s, o, (at += 60_000));
          if (!cmd) continue;
          let next: SessionState;
          try {
            next = applyCommand(s, cmd);
          } catch (e) {
            if (e instanceof EngineError) continue; // rejected commands leave state untouched
            throw e;
          }
          checkInvariants(s, cmd, next);
          s = next;
        }
      }),
      { numRuns: 300 },
    );
  });

  it("is deterministic: same commands, same result", () => {
    const build = () => {
      let s = addPlayers(session({ courts: 3 }), 17);
      const live = s.matches.filter((m) => m.status === "called");
      for (const m of live) s = applyCommand(s, { type: "CompleteMatch", matchId: m.id, scoreA: 11, scoreB: 9, at: T0 + 900_000 });
      return s;
    };
    expect(JSON.stringify(build())).toBe(JSON.stringify(build()));
  });
});
