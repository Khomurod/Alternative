/**
 * @vitest-environment jsdom
 */

import { describe, expect, it } from "vitest";
import { decorateDatOneViewport, findDatOneViewport, parseDatOneVirtualRow } from "../src/dat-one-virtual.js";

function loadDatOneFixture() {
  document.body.innerHTML = `
    <cdk-virtual-scroll-viewport id="table-viewport" data-test="results-table-body" class="cdk-virtual-scroll-viewport table-rows-container">
      <div class="cdk-virtual-scroll-content-wrapper">
        <div class="row-container">
          <div class="table-cell cell-rate"><span>$1,200</span></div>
          <div class="table-cell cell-trip">744</div>
          <dat-route>
            <div class="origin"><span class="extended-trip-point">Pemberton, NJ</span></div>
            <div class="destination"><span class="extended-trip-point">Joliet, IL</span></div>
          </dat-route>
          <div class="table-cell"><dat-company><div>Axle Logistics LLC</div></dat-company></div>
          <div class="table-cell">broker@example.com</div>
          <div class="table-cell">97 CS, 19 DTP</div>
        </div>
      </div>
    </cdk-virtual-scroll-viewport>
  `;
}

describe("DAT One virtual scroll adapter", () => {
  it("finds the CDK viewport by stable selectors", () => {
    loadDatOneFixture();
    expect(findDatOneViewport(document)?.id).toBe("table-viewport");
  });

  it("parses synthetic dat-route rows", () => {
    loadDatOneFixture();
    const row = document.querySelector(".row-container");
    const parsed = parseDatOneVirtualRow(row);
    expect(parsed.origin).toContain("Pemberton");
    expect(parsed.destination).toContain("Joliet");
    expect(parsed.rateDollars).toBe(1200);
    expect(parsed.tripMiles).toBe(744);
    expect(parsed.cs).toBe(97);
    expect(parsed.dtp).toBe(19);
    expect(parsed.contact).toContain("broker@example.com");
  });

  it("decorates virtual rows", () => {
    loadDatOneFixture();
    const viewport = findDatOneViewport(document);
    const summary = decorateDatOneViewport(viewport, { minRate: 1000, minRpm: 1.5 }, { onlyMatches: false });
    expect(summary.rowCount).toBe(1);
    expect(summary.matched).toBe(1);
    expect(summary.averageRate).toBe(1200);

    const row = document.querySelector(".row-container");
    expect(row.classList.contains("dat-ext-grid-row--pass")).toBe(true);
  });

  it("hides non-matching rows when filtering is active", () => {
    loadDatOneFixture();
    const viewport = findDatOneViewport(document);
    const summary = decorateDatOneViewport(viewport, { minRate: 5000, minRpm: 9 }, { onlyMatches: true });

    expect(summary.rowCount).toBe(1);
    expect(summary.matched).toBe(0);
    expect(document.querySelector(".row-container").classList.contains("dat-ext-grid-row--hidden")).toBe(true);
  });
});
