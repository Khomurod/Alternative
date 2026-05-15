import { describe, expect, it } from "vitest";
import { downsamplePolyline, encodePolylinePrecision5 } from "../src/polyline-encode.js";

describe("encodePolylinePrecision5", () => {
  it("encodes a two-point line to a non-empty string", () => {
    const encoded = encodePolylinePrecision5([
      [33.854548, -84.217142],
      [39.103119, -84.512017]
    ]);
    expect(typeof encoded).toBe("string");
    expect(encoded.length).toBeGreaterThan(4);
  });

  it("round-trips length after downsampling a long synthetic path", () => {
    const pts = Array.from({ length: 500 }, (_, i) => [33 + i * 0.01, -84 + i * 0.001]);
    const down = downsamplePolyline(pts, 20);
    expect(down.length).toBe(20);
    expect(down[0]).toEqual(pts[0]);
    expect(down[19]).toEqual(pts[499]);
    const enc = encodePolylinePrecision5(down);
    expect(enc.length).toBeGreaterThan(10);
  });
});
