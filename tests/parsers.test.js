import { describe, expect, it } from "vitest";
import {
  buildColumnMap,
  classifyBrokerSignals,
  evaluateRowAgainstTargets,
  extractEmail,
  extractPhone,
  normalizeHeaderKey,
  parseCsDtpCell,
  parseRateCell,
  parseTripCell,
  parseWeightCell,
  resolveDisplayRpm,
  resolveDetailPanelRpm,
  sanitizeLocationText
} from "../src/parsers.js";

describe("normalizeHeaderKey", () => {
  it("collapses whitespace and lowercases", () => {
    expect(normalizeHeaderKey("  CS / DTP \n")).toBe("cs / dtp");
  });
});

describe("buildColumnMap", () => {
  const headers = [
    "Age",
    "Rate",
    "Trip",
    "Origin",
    "DH-O",
    "Destination",
    "DH-D",
    "Pick Up",
    "EQ",
    "Length",
    "Weight",
    "Capacity",
    "Company",
    "Contact",
    "CS / DTP"
  ];

  it("maps DAT One style headers", () => {
    const map = buildColumnMap(headers);
    expect(map.rate).toBe(1);
    expect(map.trip).toBe(2);
    expect(map.origin).toBe(3);
    expect(map.dhO).toBe(4);
    expect(map.destination).toBe(5);
    expect(map.dhD).toBe(6);
    expect(map.company).toBe(12);
    expect(map.contact).toBe(13);
    expect(map.csDtp).toBe(14);
  });

  it("supports DH O spacing variant", () => {
    const map = buildColumnMap(["Origin", "DH O", "Destination", "DH D", "Rate", "Trip", "Company", "Contact", "CS/DTP"]);
    expect(map.dhO).toBe(1);
    expect(map.dhD).toBe(3);
  });
});

describe("parseRateCell", () => {
  it("parses combined dollars and rpm hint", () => {
    expect(parseRateCell("$1,150 $1.55/mi")).toEqual({ dollars: 1150, rpmHint: 1.55 });
  });

  it("parses DAT cells with an asterisk in the rpm fragment", () => {
    expect(parseRateCell("$1,100 $1.33*/mi")).toEqual({ dollars: 1100, rpmHint: 1.33 });
  });

  it("handles blank negotiated loads", () => {
    expect(parseRateCell("")).toEqual({ dollars: null, rpmHint: null });
    expect(parseRateCell("   ")).toEqual({ dollars: null, rpmHint: null });
  });

  it("parses rpm-only style cells", () => {
    expect(parseRateCell("$1.62/mi")).toEqual({ dollars: null, rpmHint: 1.62 });
  });

  it("does not treat trip miles as an rpm hint", () => {
    expect(parseRateCell("406 mi")).toEqual({ dollars: null, rpmHint: null });
    expect(parseRateCell("Trip 406 mi")).toEqual({ dollars: null, rpmHint: null });
  });
});

describe("parseTripCell", () => {
  it("reads trip mileage", () => {
    expect(parseTripCell("744")).toBe(744);
    expect(parseTripCell("1,024")).toBe(1024);
  });

  it("returns null when missing", () => {
    expect(parseTripCell("")).toBeNull();
  });
});

describe("parseWeightCell", () => {
  it("parses lbs values", () => {
    expect(parseWeightCell("35,000 lbs")).toBe(35000);
    expect(parseWeightCell("10000 LBS")).toBe(10000);
  });

  it("returns null when missing", () => {
    expect(parseWeightCell("")).toBeNull();
  });
});

describe("parseCsDtpCell", () => {
  it("parses labeled broker metrics", () => {
    expect(parseCsDtpCell("97 CS, 19 DTP")).toEqual({ cs: 97, dtp: 19 });
  });

  it("falls back to numeric pairs", () => {
    expect(parseCsDtpCell("97, 19")).toEqual({ cs: 97, dtp: 19 });
  });
});

describe("extractEmail / extractPhone", () => {
  it("pulls email addresses", () => {
    expect(extractEmail("broker@example.com")).toBe("broker@example.com");
    expect(extractEmail("reach me at ops+broker@freight.co please")).toBe("ops+broker@freight.co");
  });

  it("pulls US phone patterns", () => {
    expect(extractPhone("Call 502-555-0199")).toBe("502-555-0199");
  });
});

describe("resolveDisplayRpm", () => {
  it("prefers computed rpm from dollars and trip", () => {
    expect(resolveDisplayRpm(1150, 744, 9)).toBeCloseTo(1150 / 744, 5);
  });

  it("falls back to rpm hint when trip missing", () => {
    expect(resolveDisplayRpm(1150, null, 1.55)).toBe(1.55);
  });
});

describe("resolveDetailPanelRpm", () => {
  it("uses road miles over broker hint when both exist", () => {
    const road = 1006;
    const datTrip = 960;
    const hint = 2.5;
    expect(resolveDetailPanelRpm(2400, datTrip, road, hint)).toBeCloseTo(2400 / road, 5);
  });

  it("falls back to DAT trip when road miles unavailable", () => {
    expect(resolveDetailPanelRpm(2400, 960, null, 2.5)).toBeCloseTo(2400 / 960, 5);
  });

  it("falls back to hint when no usable miles", () => {
    expect(resolveDetailPanelRpm(2400, null, null, 2.35)).toBe(2.35);
  });
});

describe("evaluateRowAgainstTargets", () => {
  it("returns neutral when targets unset", () => {
    expect(evaluateRowAgainstTargets({ minRate: null, minRpm: null }, { rateDollars: 1000, tripMiles: 500, rpmHint: null })).toBe(
      "neutral"
    );
  });

  it("passes when both thresholds satisfied", () => {
    expect(
      evaluateRowAgainstTargets({ minRate: 1000, minRpm: 1.5 }, { rateDollars: 1150, tripMiles: 744, rpmHint: null })
    ).toBe("pass");
  });

  it("flags negotiate loads when dollar minimum required", () => {
    expect(evaluateRowAgainstTargets({ minRate: 1000, minRpm: null }, { rateDollars: null, tripMiles: 744, rpmHint: 2 })).toBe(
      "negotiate"
    );
  });

  it("handles partial success when one constraint fails", () => {
    expect(
      evaluateRowAgainstTargets({ minRate: 2000, minRpm: 1.5 }, { rateDollars: 2500, tripMiles: 2000, rpmHint: null })
    ).toBe("partial");
  });

  it("fails when all evaluated constraints fail", () => {
    expect(
      evaluateRowAgainstTargets({ minRate: null, minRpm: 3 }, { rateDollars: 800, tripMiles: 800, rpmHint: null })
    ).toBe("fail");
  });

  it("supports max miles and max weight filters", () => {
    expect(
      evaluateRowAgainstTargets(
        { minRate: null, minRpm: null, maxMiles: 500, maxWeight: 42000 },
        { rateDollars: 1000, tripMiles: 450, rpmHint: null, weightLbs: 40000 }
      )
    ).toBe("pass");

    expect(
      evaluateRowAgainstTargets(
        { minRate: null, minRpm: null, maxMiles: 500, maxWeight: 42000 },
        { rateDollars: 1000, tripMiles: 700, rpmHint: null, weightLbs: 50000 }
      )
    ).toBe("fail");
  });
});

describe("classifyBrokerSignals", () => {
  it("marks risky brokers", () => {
    expect(classifyBrokerSignals(65, 10)).toBe("risk");
    expect(classifyBrokerSignals(95, 60)).toBe("risk");
  });

  it("marks strong brokers", () => {
    expect(classifyBrokerSignals(95, 18)).toBe("strong");
  });
});

describe("sanitizeLocationText", () => {
  it("removes deadhead counts and noisy prefixes", () => {
    expect(sanitizeLocationText("Trip Reading, PA (46)")).toBe("Reading, PA");
    expect(sanitizeLocationText("Origin: Newark, NJ (28)")).toBe("Newark, NJ");
    expect(sanitizeLocationText("DH 46 Tucker, GA")).toBe("Tucker, GA");
    expect(sanitizeLocationText("Tucker, GA DH 46")).toBe("Tucker, GA");
    expect(sanitizeLocationText("DH-O LaGrange, GA")).toBe("LaGrange, GA");
  });
});
