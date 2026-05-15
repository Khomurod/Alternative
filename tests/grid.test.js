/**
 * @vitest-environment jsdom
 */

import { describe, expect, it } from "vitest";
import { decorateLoadsTable, findResultsGrid, scanDocumentForGrids, scoreLoadsTable } from "../src/grid.js";

function buildFixtureTable() {
  document.body.innerHTML = `
    <table id="loads">
      <thead>
        <tr>
          <th>Age</th>
          <th>Rate</th>
          <th>Trip</th>
          <th>Origin</th>
          <th>DH-O</th>
          <th>Destination</th>
          <th>DH-D</th>
          <th>Pick Up</th>
          <th>EQ</th>
          <th>Length</th>
          <th>Weight</th>
          <th>Capacity</th>
          <th>Company</th>
          <th>Contact</th>
          <th>CS / DTP</th>
        </tr>
      </thead>
      <tbody>
        <tr id="row-strong">
          <td>3m</td>
          <td>$1,150 $1.55/mi</td>
          <td>744</td>
          <td>Allentown, PA</td>
          <td>120</td>
          <td>Melrose Park, IL</td>
          <td>40</td>
          <td>5/1</td>
          <td>V</td>
          <td>53 ft</td>
          <td>38,400 lbs</td>
          <td>Full</td>
          <td>Sample Broker LLC</td>
          <td>dispatch@samplebroker.test</td>
          <td>97 CS, 19 DTP</td>
        </tr>
        <tr id="row-miss">
          <td>5m</td>
          <td>$900 $1.10/mi</td>
          <td>820</td>
          <td>Cleveland, OH</td>
          <td>40</td>
          <td>Dallas, TX</td>
          <td>120</td>
          <td>5/2</td>
          <td>V</td>
          <td>53 ft</td>
          <td>42,000 lbs</td>
          <td>Full</td>
          <td>Low Rate Logistics</td>
          <td>(502) 555-0199 broker@lowrate.test</td>
          <td>60 CS, 40 DTP</td>
        </tr>
        <tr id="row-negotiate">
          <td>1m</td>
          <td></td>
          <td>640</td>
          <td>Chicago, IL</td>
          <td>10</td>
          <td>Nashville, TN</td>
          <td>25</td>
          <td>5/3</td>
          <td>V</td>
          <td>53 ft</td>
          <td>44,000 lbs</td>
          <td>Full</td>
          <td>Negotiate Freight Co</td>
          <td></td>
          <td>88 CS, 21 DTP</td>
        </tr>
      </tbody>
    </table>
  `;

  return document.getElementById("loads");
}

describe("findResultsGrid & scoring", () => {
  it("selects the DAT-like loads table", () => {
    buildFixtureTable();
    expect(scoreLoadsTable(document.getElementById("loads"))).toBeGreaterThanOrEqual(6);
    expect(findResultsGrid(document)).toBe(document.getElementById("loads"));
  });
});

describe("scanDocumentForGrids", () => {
  it("processes the strongest loads table when multiples exist", () => {
    buildFixtureTable();
    document.body.insertAdjacentHTML(
      "afterbegin",
      `
      <table id="noise">
        <thead><tr><th>Name</th><th>Value</th></tr></thead>
        <tbody>
          <tr><td>Foo</td><td>10</td></tr>
          <tr><td>Bar</td><td>20</td></tr>
          <tr><td>Baz</td><td>30</td></tr>
        </tbody>
      </table>
    `
    );

    const summary = scanDocumentForGrids(document, { minRate: 1000, minRpm: 1.45 }, { withActions: false });
    expect(summary.rowCount).toBe(3);
    expect(summary.matched).toBe(1);

    const noiseRows = document.querySelectorAll("#noise tbody tr.dat-ext-grid-row");
    expect(noiseRows.length).toBe(0);
  });
});

describe("decorateLoadsTable", () => {
  it("annotates rows against targets without crowding the contact column", () => {
    const table = buildFixtureTable();
    const targets = { minRate: 1000, minRpm: 1.45 };

    const summary = decorateLoadsTable(table, targets, { onlyMatches: false });
    expect(summary.rowCount).toBe(3);
    expect(summary.matched).toBe(1);
    expect(summary.negotiate).toBe(1);

    const strongRow = document.getElementById("row-strong");
    expect(strongRow.classList.contains("dat-ext-grid-row--pass")).toBe(true);
    expect(strongRow.querySelector(".dat-ext-contact-actions")).toBeFalsy();

    const missRow = document.getElementById("row-miss");
    expect(missRow.classList.contains("dat-ext-grid-row--fail")).toBe(true);

    const negotiateRow = document.getElementById("row-negotiate");
    expect(negotiateRow.classList.contains("dat-ext-grid-row--negotiate")).toBe(true);
  });

  it("clears stale classes between passes", () => {
    const table = buildFixtureTable();
    decorateLoadsTable(table, { minRate: 1000, minRpm: 3 }, { withActions: false });
    const strongRow = document.getElementById("row-strong");
    expect(strongRow.className.includes("dat-ext-grid-row--")).toBe(true);

    decorateLoadsTable(table, { minRate: null, minRpm: null }, { withActions: false });
    expect(strongRow.classList.contains("dat-ext-grid-row--neutral")).toBe(true);
  });

  it("hides non-matches when onlyMatches is enabled", () => {
    const table = buildFixtureTable();
    decorateLoadsTable(table, { minRate: 1000, minRpm: 1.45, onlyMatches: true }, { onlyMatches: true });

    expect(document.getElementById("row-strong").classList.contains("dat-ext-grid-row--hidden")).toBe(false);
    expect(document.getElementById("row-miss").classList.contains("dat-ext-grid-row--hidden")).toBe(true);
    expect(document.getElementById("row-negotiate").classList.contains("dat-ext-grid-row--hidden")).toBe(true);
  });
});
