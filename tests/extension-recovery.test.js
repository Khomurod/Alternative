import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { persistAndResolveDirectionsSearchOrigin, DAT_EXT_LAST_SEARCH_ORIGIN_SESSION_KEY } from "../src/directions-search-origin.js";
import {
  buildGoogleDirectionsUrl,
  formatDirectionsWaypointVia,
  validateBuiltDirectionsUrlMatches
} from "../src/route-icon-directions.js";
import { evaluateRowAgainstTargets } from "../src/parsers.js";
import { shouldFallbackTollToGoogle } from "../src/toll-google-fallback.js";
import { HARDCODED_TOLLGURU_API_KEY } from "../src/tollguru-api-key.js";

describe("route-icon-directions (A-B-C)", () => {
  test("three-leg URL uses www.google.com/maps/dir with via waypoint", () => {
    const url = buildGoogleDirectionsUrl("Dallas, TX", "Houston, TX", "Austin, TX");
    assert.ok(url.startsWith("https://www.google.com/maps/dir/"));
    assert.ok(!url.includes("googleusercontent"));
    assert.ok(url.includes("waypoints="));
    assert.ok(url.includes("via"));
    assert.ok(
      validateBuiltDirectionsUrlMatches(url, "Dallas, TX", "Houston, TX", "Austin, TX")
    );
  });

  test("two-leg URL when search origin matches pickup (case-insensitive)", () => {
    const url = buildGoogleDirectionsUrl("houston, TX", "Houston, TX", "Austin, TX");
    assert.ok(!url.includes("waypoints="));
    assert.ok(
      validateBuiltDirectionsUrlMatches(url, "houston, TX", "Houston, TX", "Austin, TX")
    );
  });

  test("formatDirectionsWaypointVia prefixes via once", () => {
    assert.equal(formatDirectionsWaypointVia("Chicago, IL"), "via:Chicago, IL");
    assert.equal(formatDirectionsWaypointVia("via:Chicago, IL"), "via:Chicago, IL");
  });
});

describe("directions-search-origin", () => {
  test("persists live origin and resolves after DOM clears", () => {
    const store = new Map();
    globalThis.sessionStorage = {
      getItem: (k) => store.get(k) ?? null,
      setItem: (k, v) => {
        store.set(k, v);
      },
      removeItem: (k) => {
        store.delete(k);
      }
    };

    const doc = /** @type {Document} */ ({});
    let phase = 0;
    const read = () => {
      phase += 1;
      return phase === 1 ? "Denver, CO" : "";
    };

    const first = persistAndResolveDirectionsSearchOrigin(doc, read);
    assert.equal(first, "Denver, CO");
    assert.equal(store.get(DAT_EXT_LAST_SEARCH_ORIGIN_SESSION_KEY), "Denver, CO");

    const second = persistAndResolveDirectionsSearchOrigin(doc, read);
    assert.equal(second, "Denver, CO");
  });
});

describe("evaluateRowAgainstTargets (disqualify-on-empty)", () => {
  test("fails when max miles filter active but no posted rate", () => {
    const row = {
      rateDollars: null,
      tripMiles: 400,
      rpmHint: null,
      weightLbs: 42000
    };
    assert.equal(
      evaluateRowAgainstTargets({ minRate: null, minRpm: null, maxMiles: 500, maxWeight: null }, row),
      "fail"
    );
  });

  test("passes miles filter when rate present", () => {
    const row = {
      rateDollars: 2500,
      tripMiles: 400,
      rpmHint: null,
      weightLbs: 42000
    };
    assert.equal(
      evaluateRowAgainstTargets({ minRate: null, minRpm: null, maxMiles: 500, maxWeight: null }, row),
      "pass"
    );
  });
});

describe("shouldFallbackTollToGoogle", () => {
  test("allows 404-ish transport failures", () => {
    assert.equal(shouldFallbackTollToGoogle(new Error("Remote request failed (404)")), true);
    assert.equal(shouldFallbackTollToGoogle(new Error("Failed to fetch")), true);
    assert.equal(shouldFallbackTollToGoogle(new Error("timeout")), true);
  });

  test("allows 403 so Google can substitute TollGuru plan/quota denials", () => {
    assert.equal(shouldFallbackTollToGoogle(new Error("HTTP 403")), true);
    assert.equal(shouldFallbackTollToGoogle(new Error("Remote request failed (403)")), true);
  });

  test("blocks 401 so invalid TollGuru key is not masked by Google toll line", () => {
    assert.equal(shouldFallbackTollToGoogle(new Error("HTTP 401")), false);
    assert.equal(shouldFallbackTollToGoogle(new Error("Remote request failed (401)")), false);
  });

  test("null error never falls back", () => {
    assert.equal(shouldFallbackTollToGoogle(null), false);
  });
});

describe("TollGuru bundled key", () => {
  test("HARDCODED_TOLLGURU_API_KEY matches expected tg_ prefix", () => {
    assert.equal(HARDCODED_TOLLGURU_API_KEY, "tg_B0FB9D6C300342C688D755047EA0D917");
  });
});
