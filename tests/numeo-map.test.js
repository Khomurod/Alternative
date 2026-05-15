/**
 * @vitest-environment jsdom
 */

import { describe, expect, it } from "vitest";
import {
  latLngsWithinMiles,
  mountLaneMap,
  resolveThreePointMarkers
} from "../src/numeo-map.js";

describe("resolveThreePointMarkers", () => {
  it("returns A, B, and C when search origin is more than 1 mile from pickup", () => {
    const markers = resolveThreePointMarkers({
      searchOriginLatLng: [33.74, -84.39],
      pickupLatLng: [33.85, -84.21],
      deliveryLatLng: [45.32, -92.7]
    });

    expect(markers.map((m) => m.label)).toEqual(["A", "B", "C"]);
    expect(markers[0].color).toBe("#0b66ff");
    expect(markers[1].color).toBe("#16a34a");
    expect(markers[2].color).toBe("#dc2626");
  });

  it("merges search origin into pickup when within 1 mile", () => {
    const pickup = [33.85, -84.21];
    const search = [33.851, -84.211];
    expect(latLngsWithinMiles(search, pickup)).toBe(true);

    const markers = resolveThreePointMarkers({
      searchOriginLatLng: search,
      pickupLatLng: pickup,
      deliveryLatLng: [45.32, -92.7]
    });

    expect(markers.map((m) => m.label)).toEqual(["A+B", "C"]);
    expect(markers[0].combined).toBe(true);
  });
});

describe("mountLaneMap static rendering", () => {
  it("renders a square Google static map with A/B/C markers when key is configured", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);

    const map = mountLaneMap(
      container,
      [
        [33.74, -84.39],
        [33.85, -84.21],
        [39.103, -84.512]
      ],
      {
        searchOriginLatLng: [33.74, -84.39],
        pickupLatLng: [33.85, -84.21],
        deliveryLatLng: [39.103, -84.512]
      }
    );

    const img = container.querySelector("img");
    expect(img).toBeTruthy();
    expect(img.src).toContain("size=360x360");
    const decoded = decodeURIComponent(img.src);
    expect(decoded).toContain("label:A");
    expect(decoded).toContain("label:B");
    expect(decoded).toContain("label:C");

    map?.remove?.();
  });

  it("uses a single pickup marker when search origin overlaps pickup", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const pickup = [33.85, -84.21];

    const map = mountLaneMap(
      container,
      [
        [33.851, -84.211],
        pickup,
        [39.103, -84.512]
      ],
      {
        searchOriginLatLng: [33.851, -84.211],
        pickupLatLng: pickup,
        deliveryLatLng: [39.103, -84.512]
      }
    );

    const img = container.querySelector("img");
    const decoded = decodeURIComponent(img?.src || "");
    expect(decoded).not.toContain("label:A|");
    expect(decoded).toContain("label:B");
    expect(decoded).toContain("label:C");

    map?.remove?.();
  });
});
