/**
 * @vitest-environment jsdom
 */

import { describe, expect, it } from "vitest";
import { mountLaneMap } from "../src/numeo-map.js";

describe("mountLaneMap static rendering", () => {
  it("renders a square Google static map with A/B markers when key is configured", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);

    const map = mountLaneMap(
      container,
      [
        [33.85, -84.21],
        [39.103, -84.512]
      ],
      {
        pickupLatLng: [33.85, -84.21],
        deliveryLatLng: [39.103, -84.512]
      }
    );

    const img = container.querySelector("img");
    expect(img).toBeTruthy();
    expect(img.src).toContain("size=360x360");
    expect(decodeURIComponent(img.src)).toContain("label:A");
    expect(decodeURIComponent(img.src)).toContain("label:B");

    map?.remove?.();
  });
});
