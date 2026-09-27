import { describe, expect, it } from "vitest";
import { formatRoster, parsePlayerList } from "../roster";
import { T0, addPlayers, byStatus, run, session } from "./helpers";

describe("parsePlayerList", () => {
  it("handles group-chat style lists", () => {
    const text = `Friday Open Play:
1. Maria Santos 3.5
2) Jun Reyes
• Ana Cruz (4.0)
- Paolo Garcia - 3
✅ Liza Tan
10.  Carlo  Mendoza   2.5 🏓

Rose Dela Cruz`;
    expect(parsePlayerList(text).map((e) => [e.name, e.skill])).toEqual([
      ["Maria Santos", 3.5],
      ["Jun Reyes", null],
      ["Ana Cruz", 4],
      ["Paolo Garcia", 3],
      ["Liza Tan", null],
      ["Carlo Mendoza", 2.5],
      ["Rose Dela Cruz", null],
    ]);
  });

  it("splits a single line on commas", () => {
    expect(parsePlayerList("Maria, Jun ,Ana").map((e) => e.name)).toEqual(["Maria", "Jun", "Ana"]);
  });

  it("flags duplicates and people already checked in, and re-uses checked-out players", () => {
    let s = addPlayers(session({ courts: 1 }), 2); // Player 1, Player 2
    s = run(s, { type: "RemovePlayer", playerId: "p2" });
    const parsed = parsePlayerList("Player 1\nPlayer 2\nNew Person\nnew person", s);
    expect(parsed.map((e) => e.skip)).toEqual(["already_here", null, null, "duplicate"]);
    expect(parsed[1]!.existingId).toBe("p2");
  });

  it("doesn't mistake a number in a name for a skill", () => {
    expect(parsePlayerList("Player 1\nPlayer 2\nKim 3")).toMatchObject([
      { name: "Player 1", skill: null },
      { name: "Player 2", skill: null },
      { name: "Kim 3", skill: null },
    ]);
    expect(parsePlayerList("Kim - 3\nLee (4)\nJo 3.5")).toMatchObject([
      { name: "Kim", skill: 3 },
      { name: "Lee", skill: 4 },
      { name: "Jo", skill: 3.5 },
    ]);
  });
});

describe("formatRoster", () => {
  it("lists courts, the line with waiting times, and who is out", () => {
    let s = addPlayers(session({ courts: 1 }), 6);
    const live = byStatus(s, "called")[0]!;
    s = run(s, { type: "StartMatch", matchId: live.id }, { type: "SetRest", playerId: "p6" });
    const text = formatRoster(s, T0 + 20 * 60_000);
    expect(text).toContain("6 players checked in");
    expect(text).toMatch(/Court 1: .+ vs .+ \(playing \d+ min\)/);
    expect(text).toMatch(/1\. Player 5 \(waiting 19 min\)/);
    expect(text).toContain("Resting: Player 6");
  });
});
