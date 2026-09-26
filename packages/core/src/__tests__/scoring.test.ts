import { describe, expect, it } from "vitest";
import { DEFAULT_SCORING_RULES, callout, finalScore, replayScore } from "../scoring/engine";
import type { ScoreEvent, ScoringRules } from "../scoring/types";

const rally = (...winners: ("A" | "B")[]): ScoreEvent[] => winners.map((winner, i) => ({ type: "RALLY", winner, at: i }));
const times = (w: "A" | "B", n: number) => Array<"A" | "B">(n).fill(w);

describe("side-out scoring (doubles)", () => {
  it("starts at 0-0-2", () => {
    const s = replayScore(DEFAULT_SCORING_RULES, []);
    expect(callout(s)).toBe("0-0-2");
  });

  it("first fault is an immediate side-out, then two servers each", () => {
    let s = replayScore(DEFAULT_SCORING_RULES, rally("B"));
    expect(s.servingTeam).toBe("B");
    expect(callout(s)).toBe("0-0-1");

    s = replayScore(DEFAULT_SCORING_RULES, rally("B", "B", "A"));
    expect(callout(s)).toBe("1-0-2"); // B scored once, then lost the rally with server 1
    s = replayScore(DEFAULT_SCORING_RULES, rally("B", "B", "A", "A"));
    expect(s.servingTeam).toBe("A");
    expect(callout(s)).toBe("0-1-1");
  });

  it("only the serving team scores", () => {
    const s = replayScore(DEFAULT_SCORING_RULES, rally("A", "A", "B"));
    expect([s.a, s.b]).toEqual([2, 0]);
  });

  it("requires a two-point margin", () => {
    const rules: ScoringRules = { ...DEFAULT_SCORING_RULES, system: "rally" };
    const toTen = rally(...times("A", 10), ...times("B", 10));
    let s = replayScore(rules, [...toTen, ...rally("A")]);
    expect(s.finished).toBe(false);
    expect(s.gamePoint).toBe("A");
    s = replayScore(rules, [...toTen, ...rally("A", "A")]);
    expect(s.finished).toBe(true);
    expect(s.winner).toBe("A");
    expect(finalScore(s)).toEqual({ a: 12, b: 10 });
  });

  it("singles has no second server", () => {
    const s = replayScore(DEFAULT_SCORING_RULES, rally("B"), false);
    expect(s.servingTeam).toBe("B");
    expect(callout(s)).toBe("0-0");
  });
});

describe("rally scoring", () => {
  const rules: ScoringRules = { ...DEFAULT_SCORING_RULES, system: "rally", pointsToWin: 21, switchSidesAt: 11 };

  it("every rally scores and the serve follows the rally winner", () => {
    const s = replayScore(rules, rally("A", "B", "B"));
    expect([s.a, s.b]).toEqual([1, 2]);
    expect(s.servingTeam).toBe("B");
  });

  it("flags a side switch at the configured score", () => {
    const s = replayScore(rules, rally(...times("A", 11)));
    expect(s.sideSwitchDue).toBe(true);
    const next = replayScore(rules, rally(...times("A", 12)));
    expect(next.sideSwitchDue).toBe(false);
  });

  it("respects a hard cap", () => {
    const capped: ScoringRules = { ...rules, pointsToWin: 11, cap: 13 };
    const s = replayScore(capped, rally(...times("A", 10), ...times("B", 10), "A", "B", "A", "B", "A", "B", "A"));
    expect(s.finished).toBe(true);
    expect([s.a, s.b]).toEqual([13, 12]);
  });
});

describe("best of 3", () => {
  const rules: ScoringRules = { ...DEFAULT_SCORING_RULES, system: "rally", bestOf: 3 };

  it("plays until a team wins two games", () => {
    let s = replayScore(rules, rally(...times("A", 11)));
    expect(s.finished).toBe(false);
    expect(s.gameNumber).toBe(2);
    expect(s.gamesWon).toEqual({ A: 1, B: 0 });
    expect(s.sideSwitchDue).toBe(true);
    s = replayScore(rules, rally(...times("A", 11), ...times("B", 11), ...times("A", 11)));
    expect(s.finished).toBe(true);
    expect(finalScore(s)).toEqual({ a: 2, b: 1 });
  });

  it("marks match point", () => {
    const s = replayScore(rules, rally(...times("A", 11), ...times("A", 10)));
    expect(s.matchPoint).toBe("A");
  });
});

describe("undo, timeouts and quick entry", () => {
  it("undo removes the last event", () => {
    const events: ScoreEvent[] = [...rally("A", "A"), { type: "UNDO", at: 9 }];
    expect(replayScore(DEFAULT_SCORING_RULES, events).a).toBe(1);
  });

  it("undo can reopen a finished game", () => {
    const rules: ScoringRules = { ...DEFAULT_SCORING_RULES, system: "rally" };
    const s = replayScore(rules, [...rally(...times("A", 11)), { type: "UNDO", at: 99 }]);
    expect(s.finished).toBe(false);
    expect(s.a).toBe(10);
  });

  it("limits timeouts per game", () => {
    const t: ScoreEvent = { type: "TIMEOUT", team: "A", at: 1 };
    expect(replayScore(DEFAULT_SCORING_RULES, [t, t, t]).timeoutsUsed.A).toBe(2);
  });

  it("final override records a result directly", () => {
    const s = replayScore(DEFAULT_SCORING_RULES, [{ type: "FINAL_OVERRIDE", a: 7, b: 11, at: 1 }]);
    expect(s.finished).toBe(true);
    expect(s.winner).toBe("B");
    expect(finalScore(s)).toEqual({ a: 7, b: 11 });
  });

  it("ignores rallies after the match is over", () => {
    const rules: ScoringRules = { ...DEFAULT_SCORING_RULES, system: "rally" };
    const s = replayScore(rules, rally(...times("A", 11), "B"));
    expect([s.a, s.b]).toEqual([11, 0]);
  });
});
