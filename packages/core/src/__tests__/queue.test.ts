import { describe, expect, it } from "vitest";
import { matchPlayers, proposedMatches } from "../queue/engine";
import { createHistory, dispatch, undo } from "../queue/history";
import { getBoard } from "../queue/view";
import type { SessionState } from "../types";
import { T0, addPlayers, assertNoDoubleBooking, byStatus, run, session } from "./helpers";

const onCourt = (s: SessionState) => byStatus(s, "called").concat(byStatus(s, "in_progress"));
const finish = (s: SessionState, matchId: string, a = 11, b = 5) => run(s, { type: "CompleteMatch", matchId, scoreA: a, scoreB: b });

describe("filling courts", () => {
  it("calls a match to every court once there are enough players", () => {
    let s = addPlayers(session({ courts: 2 }), 3);
    expect(onCourt(s)).toHaveLength(0);
    s = addPlayers(s, 5);
    expect(onCourt(s)).toHaveLength(2);
    expect(new Set(onCourt(s).map((m) => m.courtId))).toEqual(new Set(["c1", "c2"]));
    assertNoDoubleBooking(s);
  });

  it("keeps a look-ahead of proposed matches", () => {
    const s = addPlayers(session({ courts: 2 }), 24);
    expect(proposedMatches(s)).toHaveLength(4); // 2 courts × 2
    assertNoDoubleBooking(s);
  });

  it("supports singles", () => {
    const s = addPlayers(session({ courts: 1, settings: { format: "singles" } }), 2);
    const [m] = onCourt(s);
    expect(m?.teamA).toHaveLength(1);
    expect(m?.teamB).toHaveLength(1);
  });
});

describe("fair rotation", () => {
  it("puts players who have played fewer games first", () => {
    let s = addPlayers(session({ courts: 1 }), 8);
    const first = onCourt(s)[0]!;
    const firstIds = matchPlayers(first);
    s = finish(s, first.id);
    const next = onCourt(s)[0]!;
    // The 4 who sat out go next, not the 4 who just played.
    expect(matchPlayers(next).some((id) => firstIds.includes(id))).toBe(false);
  });

  it("spreads games evenly over a long session", () => {
    let s = addPlayers(session({ courts: 2 }), 13);
    for (let round = 0; round < 30; round++) {
      for (const m of onCourt(s)) s = finish(s, m.id, 11, round % 11);
    }
    const games = Object.values(s.players).map((p) => p.gamesPlayed);
    expect(Math.max(...games) - Math.min(...games)).toBeLessThanOrEqual(1);
  });

  it("FIFO mode takes strictly the longest-waiting players", () => {
    let s = addPlayers(session({ courts: 1, mode: "fifo" }), 12);
    expect(proposedMatches(s)[0] && matchPlayers(proposedMatches(s)[0]!).sort()).toEqual(["p5", "p6", "p7", "p8"]);
    s = finish(s, onCourt(s)[0]!.id);
    expect(matchPlayers(onCourt(s)[0]!).sort()).toEqual(["p5", "p6", "p7", "p8"]);
  });
});

describe("adding a player", () => {
  it("never changes called or in-progress matches", () => {
    let s = addPlayers(session({ courts: 2 }), 12);
    const [live] = onCourt(s);
    s = run(s, { type: "StartMatch", matchId: live!.id });
    const before = JSON.stringify(onCourt(s));
    s = addPlayers(s, 3, () => 4.5);
    expect(JSON.stringify(onCourt(s))).toBe(before);
    assertNoDoubleBooking(s);
  });

  it("late-arrival rule: a newcomer doesn't jump ahead of people waiting", () => {
    let s = addPlayers(session({ courts: 1 }), 12);
    // Play a few rounds so everyone has games.
    for (let i = 0; i < 6; i++) s = finish(s, onCourt(s)[0]!.id);
    s = run(s, { type: "AddPlayer", player: { id: "late", name: "Late Larry", skill: 3 } });
    const board = getBoard(s, T0 + 3_600_000);
    const pos = board.queue.find((q) => q.player.id === "late")!.position;
    const fewerGames = board.queue.filter((q) => q.player.gamesPlayed < s.players.late!.gamesCredit).length;
    expect(s.players.late!.gamesCredit).toBeGreaterThan(0);
    expect(pos).toBeGreaterThan(fewerGames);
  });

  it("without the rule a newcomer goes straight to the front", () => {
    let s = addPlayers(session({ courts: 1, settings: { lateArrivalRule: false } }), 12);
    for (let i = 0; i < 6; i++) s = finish(s, onCourt(s)[0]!.id);
    s = run(s, { type: "AddPlayer", player: { id: "late", name: "Late", skill: 3 } });
    expect(getBoard(s, T0).queue[0]!.player.id).toBe("late");
  });
});

describe("editing matches", () => {
  it("pins the organizer's picks and gives displaced players their spot back", () => {
    let s = addPlayers(session({ courts: 1 }), 16);
    const [upcoming] = proposedMatches(s);
    const displaced = upcoming!.teamA[0]!;
    // Pull someone from far back in the queue into the upcoming match.
    const board = getBoard(s, T0);
    const lastInLine = board.queue.at(-1)!.player.id;
    const teamA = [lastInLine, upcoming!.teamA[1]!];
    s = run(s, { type: "EditMatch", matchId: upcoming!.id, teamA, teamB: upcoming!.teamB });

    const edited = s.matches.find((m) => m.id === upcoming!.id)!;
    expect(edited.source).toBe("edited");
    expect(edited.teamA).toEqual(teamA);
    expect(edited.locked).toContain(lastInLine);
    // Displaced player is still at the front: first in the next proposed match.
    const next = proposedMatches(s)[1]!;
    expect(matchPlayers(next)).toContain(displaced);
    assertNoDoubleBooking(s);
  });

  it("keeps pinned matches when others join or leave", () => {
    let s = addPlayers(session({ courts: 1 }), 12);
    const [m] = proposedMatches(s);
    s = run(s, { type: "EditMatch", matchId: m!.id, teamA: m!.teamB, teamB: m!.teamA });
    s = addPlayers(s, 4);
    const kept = s.matches.find((x) => x.id === m!.id)!;
    expect(kept.status).toBe("proposed");
    expect(kept.teamA).toEqual(m!.teamB);
  });

  it("creates a manual match on a free court immediately", () => {
    let s = addPlayers(session({ courts: 2, settings: { autoCall: false } }), 8);
    expect(onCourt(s)).toHaveLength(0);
    s = run(s, { type: "CreateMatch", matchId: "manual1", teamA: ["p8", "p7"], teamB: ["p6", "p5"], courtId: "c2" });
    const manual = s.matches.find((x) => x.id === "manual1")!;
    expect(manual.status).toBe("called");
    expect(manual.courtId).toBe("c2");
    expect(manual.source).toBe("manual");
    // The rest of the line is rebuilt around it.
    expect(matchPlayers(proposedMatches(s)[0]!).sort()).toEqual(["p1", "p2", "p3", "p4"]);
    assertNoDoubleBooking(s);
  });

  it("rejects putting a player who is on court into another match", () => {
    const s = addPlayers(session({ courts: 1 }), 8);
    const live = onCourt(s)[0]!;
    const next = proposedMatches(s)[0]!;
    expect(() =>
      run(s, { type: "EditMatch", matchId: next.id, teamA: [live.teamA[0]!, next.teamA[1]!], teamB: next.teamB }),
    ).toThrow(/already in a called or live match/);
  });
});

describe("rest, away and leaving", () => {
  it("resting from a proposed match rebuilds it", () => {
    let s = addPlayers(session({ courts: 1 }), 9);
    const [m] = proposedMatches(s);
    const leaving = m!.teamA[0]!;
    s = run(s, { type: "SetRest", playerId: leaving });
    expect(proposedMatches(s).some((x) => matchPlayers(x).includes(leaving))).toBe(false);
    expect(matchPlayers(proposedMatches(s)[0]!)).toHaveLength(4);
  });

  it("leaving a called match leaves an empty seat for the organizer to fill", () => {
    let s = addPlayers(session({ courts: 1 }), 9);
    const live = onCourt(s)[0]!;
    s = run(s, { type: "SetRest", playerId: live.teamB[1]! });
    const after = s.matches.find((x) => x.id === live.id)!;
    expect(after.status).toBe("called");
    expect(after.teamB).toHaveLength(1);
    s = run(s, { type: "FillVacancies", matchId: live.id });
    expect(s.matches.find((x) => x.id === live.id)!.teamB).toHaveLength(2);
    assertNoDoubleBooking(s);
  });

  it("returning from rest keeps the player's place", () => {
    let s = addPlayers(session({ courts: 1 }), 12);
    const firstInLine = getBoard(s, T0).queue[0]!.player.id;
    s = run(s, { type: "SetRest", playerId: firstInLine }, { type: "ReturnPlayer", playerId: firstInLine });
    expect(getBoard(s, T0).queue[0]!.player.id).toBe(firstInLine);
  });

  it("can't rest a player who is mid-game", () => {
    let s = addPlayers(session({ courts: 1 }), 4);
    const live = onCourt(s)[0]!;
    s = run(s, { type: "StartMatch", matchId: live.id });
    expect(() => run(s, { type: "SetRest", playerId: live.teamA[0]! })).toThrow(/on court/);
  });
});

describe("courts", () => {
  it("disabling a court with a called match sends it back to the front of the line", () => {
    let s = addPlayers(session({ courts: 2 }), 12);
    const onC2 = onCourt(s).find((m) => m.courtId === "c2")!;
    s = run(s, { type: "DisableCourt", courtId: "c2" });
    const first = proposedMatches(s)[0]!;
    expect(first.id).toBe(onC2.id);
    expect(first.status).toBe("proposed");
  });

  it("adding a court calls the next match onto it", () => {
    let s = addPlayers(session({ courts: 1 }), 12);
    s = run(s, { type: "AddCourt", court: { id: "c9", name: "Court 9" } });
    expect(onCourt(s).map((m) => m.courtId).sort()).toEqual(["c1", "c9"]);
  });
});

describe("completion, variety and requests", () => {
  it("updates games, W/L and pair history", () => {
    let s = addPlayers(session({ courts: 1 }), 4);
    const m = onCourt(s)[0]!;
    s = finish(s, m.id, 11, 7);
    const a0 = s.players[m.teamA[0]!]!;
    expect(a0.gamesPlayed).toBe(1);
    expect(a0.wins).toBe(1);
    expect(s.players[m.teamB[0]!]!.losses).toBe(1);
    const key = [m.teamA[0]!, m.teamA[1]!].sort().join("|");
    expect(s.pairHistory[key]?.partner).toBe(1);
  });

  it("rotates partners when the same four keep playing", () => {
    let s = addPlayers(session({ courts: 1 }), 4, () => 3.5);
    const partnerships = new Set<string>();
    for (let i = 0; i < 3; i++) {
      const m = onCourt(s)[0]!;
      partnerships.add([...m.teamA].sort().join("+"));
      partnerships.add([...m.teamB].sort().join("+"));
      s = finish(s, m.id);
    }
    expect(partnerships.size).toBe(6); // every possible partnership once
  });

  it("balances teams: best + worst vs the middle two", () => {
    const skills = [2.5, 3.0, 3.5, 4.5];
    const s = addPlayers(session({ courts: 1 }), 4, (i) => skills[i]!);
    const m = onCourt(s)[0]!;
    const withBest = [m.teamA, m.teamB].find((t) => t.includes("p4"))!;
    expect(withBest).toContain("p1");
  });

  it("honours partner requests", () => {
    let s = addPlayers(session({ courts: 1 }), 4, () => 3.5);
    s = run(s, { type: "SetPartnerRequest", playerId: "p1", partnerId: "p4" }, { type: "SetPartnerRequest", playerId: "p4", partnerId: "p1" });
    s = run(s, { type: "CancelMatch", matchId: onCourt(s)[0]!.id });
    const m = onCourt(s)[0]!;
    const team = [m.teamA, m.teamB].find((t) => t.includes("p1"))!;
    expect(team).toContain("p4");
  });
});

describe("queue modes", () => {
  it("winners stay on court up to the cap", () => {
    let s = addPlayers(session({ courts: 1, mode: "winners_stay" }), 12);
    const m1 = onCourt(s)[0]!;
    s = finish(s, m1.id, 11, 3);
    const m2 = onCourt(s)[0]!;
    expect(m2.teamA).toEqual(m1.teamA);
    s = finish(s, m2.id, 11, 3);
    const m3 = onCourt(s)[0]!;
    // Cap of 2 consecutive games reached: the winners come off.
    expect(matchPlayers(m3).some((id) => m1.teamA.includes(id))).toBe(false);
  });

  it("paddle stack: a full group plays together", () => {
    let s = addPlayers(session({ courts: 1, mode: "stack", settings: { autoCall: false } }), 8);
    s = run(s, { type: "SetGroup", playerIds: ["p1", "p3", "p6", "p8"], groupId: "g1" });
    const first = proposedMatches(s)[0]!;
    expect(matchPlayers(first).sort()).toEqual(["p1", "p3", "p6", "p8"]);
  });
});

describe("undo", () => {
  it("restores the previous state and bumps the version", () => {
    let h = createHistory(addPlayers(session({ courts: 1 }), 6));
    const before = h.present;
    h = dispatch(h, { type: "SetAway", playerId: "p2", at: T0 + 100 });
    expect(h.present.players.p2!.status).toBe("away");
    h = undo(h, T0 + 200);
    expect(h.present.players.p2!.status).toBe(before.players.p2!.status);
    expect(h.present.version).toBe(before.version + 2);
    expect(h.present.log.at(-1)!.summary).toMatch(/Undid/);
  });
});
