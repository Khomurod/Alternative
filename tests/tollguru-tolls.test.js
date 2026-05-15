/**
 * @vitest-environment jsdom
 */

import { describe, expect, it, vi } from "vitest";
import { getEffectiveTollGuruApiKey } from "../src/tollguru-api-key.js";
import {
  fetchTollGuruLaneTolls,
  fetchTollGuruTollStatus,
  formatTollStatusFromOriginDestinationResponse,
  formatTollStatusFromTollGuruResponse,
  preparePointsForTollGuru,
  TOLLGURU_COMPLETE_POLYLINE_URL,
  TOLLGURU_ORIGIN_DESTINATION_URL
} from "../src/tollguru-tolls.js";

describe("getEffectiveTollGuruApiKey", () => {
  it("prefers non-empty chrome storage value over bundled default", () => {
    expect(getEffectiveTollGuruApiKey("  from-storage  ")).toBe("from-storage");
  });

  it("returns empty string when storage is empty", () => {
    expect(getEffectiveTollGuruApiKey("")).toBe("");
    expect(getEffectiveTollGuruApiKey(null)).toBe("");
  });
});

describe("formatTollStatusFromTollGuruResponse", () => {
  it("formats minimum toll when hasTolls", () => {
    const text = formatTollStatusFromTollGuruResponse({
      status: "OK",
      summary: { currency: "USD" },
      route: {
        hasTolls: true,
        costs: { minimumTollCost: 42.14, tag: 42.14 }
      }
    });
    expect(text).toBe("USD 42.14 est (TollGuru)");
  });

  it("returns No tolls reported when hasTolls is false", () => {
    expect(
      formatTollStatusFromTollGuruResponse({
        status: "OK",
        route: { hasTolls: false }
      })
    ).toBe("No tolls reported");
  });

  it("throws on bad status", () => {
    expect(() =>
      formatTollStatusFromTollGuruResponse({
        status: "ERROR",
        route: { hasTolls: true }
      })
    ).toThrow(/status/);
  });

  it("handles toll segments with no price", () => {
    expect(
      formatTollStatusFromTollGuruResponse({
        status: "OK",
        summary: { currency: "USD" },
        route: { hasTolls: true, costs: {} }
      })
    ).toBe("Toll segments detected (estimate unavailable)");
  });
});

describe("preparePointsForTollGuru", () => {
  it("returns empty for short input", () => {
    expect(preparePointsForTollGuru([[40, -74]])).toEqual([]);
  });
});

describe("formatTollStatusFromOriginDestinationResponse", () => {
  it("formats cheapest toll across routes", () => {
    const text = formatTollStatusFromOriginDestinationResponse({
      status: "OK",
      summary: { currency: "USD" },
      routes: [
        { summary: { hasTolls: true }, costs: { minimumTollCost: 50 } },
        { summary: { hasTolls: true }, costs: { minimumTollCost: 12.34 } }
      ]
    });
    expect(text).toBe("USD 12.34 est (TollGuru)");
  });

  it("returns No tolls reported when no route has tolls", () => {
    expect(
      formatTollStatusFromOriginDestinationResponse({
        status: "OK",
        summary: { currency: "USD" },
        routes: [{ summary: { hasTolls: false }, costs: {} }]
      })
    ).toBe("No tolls reported");
  });
});

describe("fetchTollGuruTollStatus", () => {
  it("POSTs encoded polyline with x-api-key", async () => {
    const requestJson = vi.fn().mockResolvedValue({
      status: "OK",
      summary: { currency: "USD" },
      route: { hasTolls: false }
    });

    const line = [
      [40.7357, -74.1724],
      [41.8781, -87.6298]
    ];
    const out = await fetchTollGuruTollStatus(requestJson, "test-key", line, { mapProvider: "osm" });

    expect(out).toBe("No tolls reported");
    expect(requestJson).toHaveBeenCalledWith(
      TOLLGURU_COMPLETE_POLYLINE_URL,
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "x-api-key": "test-key",
          "Content-Type": "application/json"
        }),
        body: expect.objectContaining({
          mapProvider: "osm",
          vehicle: { type: "5AxlesTruck" }
        })
      })
    );
    expect(String(requestJson.mock.calls[0][1].body.polyline || "")).toMatch(/./);
  });
});

describe("fetchTollGuruLaneTolls", () => {
  it("falls back to origin-destination when polyline request fails", async () => {
    const requestJson = vi.fn(async (url) => {
      if (String(url).includes("complete-polyline-from-mapping-service")) {
        throw new Error("HTTP 403");
      }
      if (String(url).includes("origin-destination-waypoints")) {
        return {
          status: "OK",
          summary: { currency: "USD" },
          routes: [{ summary: { hasTolls: true }, costs: { minimumTollCost: 7.5 } }]
        };
      }
      throw new Error("bad url");
    });

    const line = [
      [40.7357, -74.1724],
      [41.8781, -87.6298]
    ];
    const out = await fetchTollGuruLaneTolls(requestJson, "k", {
      mapLineLatLngs: line,
      originAddress: "A, NJ",
      destinationAddress: "B, IL"
    });

    expect(out.via).toBe("origin-destination");
    expect(out.tollStatus).toBe("USD 7.50 est (TollGuru)");
    expect(requestJson).toHaveBeenCalledTimes(2);
    expect(requestJson.mock.calls[1][0]).toBe(TOLLGURU_ORIGIN_DESTINATION_URL);
  });
});

describe("TollGuru live API (optional)", () => {
  it.skipIf(!process.env.TOLLGURU_API_KEY)(
    "returns a toll status string for a tiny two-point route (set TOLLGURU_API_KEY locally)",
    async () => {
      const requestJson = async (url, init = {}) => {
        const method = String(init?.method || "GET").toUpperCase();
        const body =
          typeof init?.body === "string"
            ? init.body
            : init?.body !== undefined && init?.body !== null
            ? JSON.stringify(init.body)
            : undefined;
        const res = await fetch(url, {
          method,
          headers: {
            Accept: "application/json",
            ...(init.headers || {})
          },
          body: method === "GET" ? undefined : body
        });
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        return res.json();
      };

      const line = [
        [40.7357, -74.1724],
        [39.9526, -75.1652]
      ];
      const status = await fetchTollGuruTollStatus(requestJson, process.env.TOLLGURU_API_KEY, line, {
        mapProvider: "osm"
      });
      expect(typeof status).toBe("string");
      expect(status.length).toBeGreaterThan(3);
    }
  );
});
