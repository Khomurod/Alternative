/**
 * @vitest-environment jsdom
 */

import { describe, expect, it } from "vitest";
import { buildRowDecorationStateKey, isActiveTargets } from "../src/row-deco-key.js";

describe("row-deco-key", () => {
  it("detects active targets", () => {
    expect(isActiveTargets({ minRate: null, minRpm: null })).toBe(false);
    expect(isActiveTargets({ minRate: 100, minRpm: null })).toBe(true);
    expect(isActiveTargets({ minRate: null, minRpm: 2 })).toBe(true);
  });

  it("produces stable decoration keys for identical row state", () => {
    const parsed = { rateDollars: 2000, tripMiles: 500, rpmHint: 4 };
    const row = document.createElement("div");
    row.id = "table-row-abc";
    const a = buildRowDecorationStateKey(parsed, "pass", "ok", { minRate: 1000, minRpm: 2 }, { onlyMatches: false }, row, 4);
    const b = buildRowDecorationStateKey(parsed, "pass", "ok", { minRate: 1000, minRpm: 2 }, { onlyMatches: false }, row, 4);
    expect(a).toBe(b);
  });

  it("changes key when filter mode toggles hidden state", () => {
    const parsed = { rateDollars: 500, tripMiles: 100, rpmHint: null };
    const row = document.createElement("div");
    const targets = { minRate: 1000, minRpm: null };
    const fail = buildRowDecorationStateKey(parsed, "fail", "ok", targets, { onlyMatches: false }, row, null);
    const failHidden = buildRowDecorationStateKey(parsed, "fail", "ok", targets, { onlyMatches: true }, row, null);
    expect(fail).not.toBe(failHidden);
  });
});
