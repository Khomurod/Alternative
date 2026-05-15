/**
 * @vitest-environment jsdom
 */

import { describe, expect, it } from "vitest";
import { buildGoogleDirectionsUrl, extractLaneFromRow } from "../src/route-icon-directions.js";

describe("route icon helpers", () => {
  it("builds Google directions with search origin, pickup waypoint, and destination", () => {
    const url = new URL(
      buildGoogleDirectionsUrl("LaGrange, GA", "Tucker, GA", "Cincinnati, OH")
    );

    expect(url.origin).toBe("https://www.google.com");
    expect(url.pathname).toBe("/maps/dir/");
    expect(url.searchParams.get("api")).toBe("1");
    expect(url.searchParams.get("origin")).toBe("LaGrange, GA");
    expect(url.searchParams.get("destination")).toBe("Cincinnati, OH");
    expect(url.searchParams.get("waypoints")).toBe("Tucker, GA");
  });

  it("omits waypoint when search origin and pickup are the same", () => {
    const url = new URL(buildGoogleDirectionsUrl("Tucker, GA", "Tucker, GA", "Cincinnati, OH"));
    expect(url.searchParams.get("origin")).toBe("Tucker, GA");
    expect(url.searchParams.get("waypoints")).toBeNull();
  });

  it("uses direct pickup-to-delivery route when search origin is empty", () => {
    const url = new URL(buildGoogleDirectionsUrl("", "Tucker, GA", "Cincinnati, OH"));
    expect(url.href.startsWith("https://www.google.com/maps/dir/")).toBe(true);
    expect(url.href).not.toContain("googleusercontent.com");
    expect(url.searchParams.get("origin")).toBe("Tucker, GA");
    expect(url.searchParams.get("destination")).toBe("Cincinnati, OH");
    expect(url.searchParams.get("waypoints")).toBeNull();
  });

  it("extracts pickup and delivery from DAT row cells", () => {
    document.body.innerHTML = `
      <div class="table-row">
        <div data-test="load-origin-cell"> Tucker, GA </div>
        <div data-test="load-destination-cell"> Cincinnati, OH </div>
      </div>
    `;
    const lane = extractLaneFromRow(document.querySelector(".table-row"));
    expect(lane).toEqual({
      pickup: "Tucker, GA",
      delivery: "Cincinnati, OH"
    });
  });

  it("returns null when row is missing lane cells", () => {
    document.body.innerHTML = `<div class="table-row"><div>no lane</div></div>`;
    expect(extractLaneFromRow(document.querySelector(".table-row"))).toBeNull();
  });
});
