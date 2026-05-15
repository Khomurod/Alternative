/**
 * @vitest-environment jsdom
 */

import { describe, expect, it } from "vitest";
import { buildGoogleDirectionsUrlForRow } from "../src/directions-from-row.js";

describe("buildGoogleDirectionsUrlForRow", () => {
  it("does not throw and uses pickup when search origin is empty (no undefined pickup bug)", () => {
    document.body.innerHTML = `
      <div class="row-container">
        <div data-test="load-origin-cell">Tucker, GA</div>
        <div data-test="load-destination-cell">Cincinnati, OH</div>
      </div>
    `;
    const row = document.querySelector(".row-container");
    expect(() => buildGoogleDirectionsUrlForRow(document, row)).not.toThrow();
    const url = new URL(buildGoogleDirectionsUrlForRow(document, row));
    expect(url.searchParams.get("origin")).toBe("Tucker, GA");
    expect(url.searchParams.get("destination")).toBe("Cincinnati, OH");
    expect(url.searchParams.get("waypoints")).toBeNull();
  });

  it("prefers search origin when set and adds pickup waypoint when distinct", () => {
    document.body.innerHTML = `
      <dat-search-location id="origin-automation"><input value="LaGrange, GA" /></dat-search-location>
      <div class="row-container">
        <div data-test="load-origin-cell">Tucker, GA</div>
        <div data-test="load-destination-cell">Cincinnati, OH</div>
      </div>
    `;
    const row = document.querySelector(".row-container");
    const url = new URL(buildGoogleDirectionsUrlForRow(document, row));
    expect(url.searchParams.get("origin")).toBe("LaGrange, GA");
    expect(url.searchParams.get("waypoints")).toBe("Tucker, GA");
    expect(url.searchParams.get("destination")).toBe("Cincinnati, OH");
  });

  it("returns null when lane cells are missing", () => {
    document.body.innerHTML = `<div class="row-container"><span>x</span></div>`;
    expect(buildGoogleDirectionsUrlForRow(document, document.querySelector(".row-container"))).toBeNull();
  });
});
