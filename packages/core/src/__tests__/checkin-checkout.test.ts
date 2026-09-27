import { describe, expect, it } from "vitest";
import { matchPlayers, proposedMatches } from "../queue/engine";
import { createHistory, dispatch, undo } from "../queue/history";
import { getBoard } from "../queue/view";
import { T0, addPlayers, assertNoDoubleBooking, byStatus, run, session } from "./helpers";

describe("courts", () => {
  it("can be renamed", () => {
    const s = run(session({ courts: 2 }), { type: "RenameCourt", courtId: "c2", name: "  Center Court " });
    expect(s.courts[1]!.name).toBe("Center Court");
    expect(() => run(s, { type: "RenameCourt", courtId: "c2", name: "  " })).toThrow(/name/);
  });
});

describe("bulk check-in", () => {
  it("adds everyone in one change, and one undo removes them all", () => {
    let h = createHistory(session({ courts: 1 }));
    h = dispatch(h, {
      type: "AddPlayers",
      at: T0 + 1,
      players: Array.from({ length: 6 }, (_, i) => ({ id: `b${i}`, name: `Bulk ${i}`, skill: 3.5 })),
    });
    expect(Object.keys(h.present.players)).toHaveLength(6);
    expect(h.present.version).toBe(1);
    expect(byStatus(h.present, "called")).toHaveLength(1);
    h = undo(h, T0 + 2);
    expect(Object.keys(h.present.players)).toHaveLength(0);
  });

  it("keeps list order as check-in order", () => {
    const s = run(session({ courts: 1, settings: { autoCall: false } }), {
      type: "AddPlayers",
      players: ["Ana", "Ben", "Cy", "Di", "Ed"].map((n) => ({ id: n, name: n })),
    });
    expect(getBoard(s, T0).queue.map((q) => q.player.id)).toEqual(["Ana", "Ben", "Cy", "Di", "Ed"]);
  });
});

describe("leaving early", () => {
  it("checks out a waiting player right away and rebuilds the line", () => {
    let s = addPlayers(session({ courts: 1 }), 9);
    const [next] = proposedMatches(s);
    const leaving = next!.teamA[0]!;
    s = run(s, { type: "RemovePlayer", playerId: leaving });
    expect(s.players[leaving]!.status).toBe("left");
    expect(getBoard(s, T0).queue.some((q) => q.player.id === leaving)).toBe(false);
    expect(matchPlayers(proposedMatches(s)[0]!)).toHaveLength(4);
  });

  it("a player mid-game is checked out when the game ends", () => {
    let s = addPlayers(session({ courts: 1 }), 8);
    const live = byStatus(s, "called")[0]!;
    s = run(s, { type: "StartMatch", matchId: live.id });
    const leaving = live.teamA[0]!;
    s = run(s, { type: "RemovePlayer", playerId: leaving });
    expect(s.players[leaving]!.status).toBe("playing");
    expect(s.players[leaving]!.leaveAfterMatch).toBe(true);
    s = run(s, { type: "CompleteMatch", matchId: live.id, scoreA: 11, scoreB: 4 });
    expect(s.players[leaving]!.status).toBe("left");
    expect(s.players[leaving]!.gamesPlayed).toBe(1); // the game still counts
    expect(s.matches.filter((m) => m.status !== "completed").flatMap(matchPlayers)).not.toContain(leaving);
    assertNoDoubleBooking(s);
  });

  it("changing their mind cancels the pending check-out", () => {
    let s = addPlayers(session({ courts: 1 }), 4);
    const live = byStatus(s, "called")[0]!;
    s = run(s, { type: "StartMatch", matchId: live.id }, { type: "RemovePlayer", playerId: live.teamA[0]! }, { type: "ReturnPlayer", playerId: live.teamA[0]! });
    s = run(s, { type: "CompleteMatch", matchId: live.id, scoreA: 11, scoreB: 4 });
    expect(s.players[live.teamA[0]!]!.status).not.toBe("left");
  });

  it("a checked-out player can check back in and keeps their stats", () => {
    let s = addPlayers(session({ courts: 1 }), 4);
    const live = byStatus(s, "called")[0]!;
    s = run(s, { type: "CompleteMatch", matchId: live.id, scoreA: 11, scoreB: 4 }, { type: "RemovePlayer", playerId: "p1" }, { type: "ReturnPlayer", playerId: "p1" });
    expect(s.players.p1!.status).not.toBe("left");
    expect(s.players.p1!.gamesPlayed).toBe(1);
  });
});

describe("waiting time", () => {
  it("counts from check-in, then from the end of their last game", () => {
    let s = addPlayers(session({ courts: 1, settings: { autoCall: false } }), 5);
    const at = (min: number) => T0 + min * 60_000;
    expect(getBoard(s, at(12) + 1_000).queue[0]!.waitingMin).toBe(12);
    s = run(s, { type: "CallMatch", matchId: proposedMatches(s)[0]!.id, courtId: "c1" });
    const m = byStatus(s, "called")[0]!;
    s = run(s, { type: "CompleteMatch", matchId: m.id, scoreA: 11, scoreB: 3 });
    const ended = s.matches.find((x) => x.id === m.id)!.endedAt!;
    const back = getBoard(s, ended + 5 * 60_000).queue.find((q) => q.player.id === m.teamA[0])!;
    expect(back.waitingMin).toBe(5);
  });
});
