/**
 * @vitest-environment jsdom
 */

import { describe, expect, it } from "vitest";
import { decorateAriaGrid, findAriaHeaderRow, findResultsGrid, scoreAriaGrid } from "../src/grid.js";

function buildAriaFixture() {
  document.body.innerHTML = `
    <div role="grid" id="loads-grid">
      <div role="rowgroup">
        <div role="row" id="header-row">
          <div role="columnheader">Age</div>
          <div role="columnheader">Rate</div>
          <div role="columnheader">Trip</div>
          <div role="columnheader">Origin</div>
          <div role="columnheader">DH-O</div>
          <div role="columnheader">Destination</div>
          <div role="columnheader">DH-D</div>
          <div role="columnheader">Company</div>
          <div role="columnheader">Contact</div>
          <div role="columnheader">CS / DTP</div>
        </div>
      </div>
      <div role="rowgroup">
        <div role="row" id="body-row">
          <div role="gridcell">3m</div>
          <div role="gridcell">$1,150 $1.55/mi</div>
          <div role="gridcell">744</div>
          <div role="gridcell">Allentown, PA</div>
          <div role="gridcell">120</div>
          <div role="gridcell">Melrose Park, IL</div>
          <div role="gridcell">40</div>
          <div role="gridcell">Sample Broker LLC</div>
          <div role="gridcell">dispatch@samplebroker.test</div>
          <div role="gridcell">97 CS, 19 DTP</div>
        </div>
      </div>
    </div>
  `;
}

describe("ARIA grids (DAT-style)", () => {
  it("detects headers even when they are not the first row in traversal order", () => {
    buildAriaFixture();
    const grid = document.getElementById("loads-grid");
    expect(findAriaHeaderRow(grid)).toBe(document.getElementById("header-row"));
    expect(scoreAriaGrid(grid)).toBeGreaterThanOrEqual(6);
  });

  it("decorates aria rows using gridcells", () => {
    buildAriaFixture();
    const grid = document.getElementById("loads-grid");
    const summary = decorateAriaGrid(grid, { minRate: 1000, minRpm: 1.45 }, { withActions: false });
    expect(summary.rowCount).toBe(1);
    expect(summary.matched).toBe(1);

    const row = document.getElementById("body-row");
    expect(row.classList.contains("dat-ext-grid-row--pass")).toBe(true);
  });

  it("selects aria grids via findResultsGrid", () => {
    buildAriaFixture();
    expect(findResultsGrid(document)).toBe(document.getElementById("loads-grid"));
  });
});
