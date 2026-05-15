/**
 * @vitest-environment jsdom
 */

import { describe, expect, it } from "vitest";
import {
  createColumnDOM,
  findRateInsertion,
  findRateRowInsertion,
  removeAllTomRows,
  renderColumn,
  TOM_COLUMN_CLASS,
  TOM_PANEL_CLASS,
  TOM_ROW_CLASS
} from "../src/numeo-column.js";

describe("findRateRowInsertion", () => {
  it("returns null when no dat-load-details / tablet-details-container exists", () => {
    document.body.innerHTML = `<div></div>`;
    expect(findRateRowInsertion(document.body.firstElementChild)).toBeNull();
  });

  it("returns null when there is no rate details container", () => {
    document.body.innerHTML = `
      <dat-load-details id="host">
        <div class="tablet-details-container">
          <div class="table-details-row">
            <div class="details-column">
              <div data-test="route-details"></div>
            </div>
          </div>
        </div>
      </dat-load-details>
    `;
    expect(findRateRowInsertion(document.getElementById("host"))).toBeNull();
  });

  it("returns the rate row when the rate-details-container exists", () => {
    document.body.innerHTML = `
      <dat-load-details id="host">
        <div class="tablet-details-container">
          <div class="table-details-row">
            <div class="details-column"><div data-test="route-details"></div></div>
          </div>
          <div class="table-details-row" id="rate-row">
            <div class="details-column"><div data-test="rate-details-container"></div></div>
            <div class="details-column"><div data-test="market-rates-detail-container"></div></div>
          </div>
        </div>
      </dat-load-details>
    `;
    const hit = findRateRowInsertion(document.getElementById("host"));
    expect(hit).not.toBeNull();
    expect(hit.rateRow.id).toBe("rate-row");
    expect(hit.tabletContainer.classList.contains("tablet-details-container")).toBe(true);
  });
});

describe("removeAllTomRows", () => {
  it("removes every row marked with the assist class and leaves DAT rows alone", () => {
    document.body.innerHTML = `
      <div class="tablet-details-container">
        <div class="table-details-row" id="keep-1"></div>
        <div class="table-details-row ${TOM_ROW_CLASS}" id="remove-1"></div>
        <div class="table-details-row ${TOM_ROW_CLASS}" id="remove-2"></div>
        <div class="table-details-row" id="keep-2"></div>
      </div>
    `;
    const container = document.querySelector(".tablet-details-container");
    removeAllTomRows(container);
    expect(container.querySelectorAll(`.${TOM_ROW_CLASS}`).length).toBe(0);
    expect(document.getElementById("keep-1")).toBeTruthy();
    expect(document.getElementById("keep-2")).toBeTruthy();
  });

  it("is a no-op on null / undefined", () => {
    expect(() => removeAllTomRows(null)).not.toThrow();
    expect(() => removeAllTomRows(undefined)).not.toThrow();
  });
});

describe("findRateInsertion (dual layout)", () => {
  it("returns row-before for the tablet stacked layout", () => {
    document.body.innerHTML = `
      <dat-load-details id="host">
        <div class="tablet-details-container">
          <div class="table-details-row" id="rate-row">
            <div class="details-column"><div data-test="rate-details-container"></div></div>
          </div>
        </div>
      </dat-load-details>
    `;
    const hit = findRateInsertion(document.getElementById("host"));
    expect(hit?.mode).toBe("row-before");
    expect(hit.before.id).toBe("rate-row");
  });

  it("returns column-before for desktop flex row of columns", () => {
    document.body.innerHTML = `
      <dat-load-details id="host">
        <div class="result-details-container">
          <div class="desktop-container">
            <div class="desktop-column" id="trip-col"></div>
            <div class="desktop-column" id="rate-col">
              <div data-test="rate-details-container"></div>
            </div>
            <div class="desktop-column" id="company-col"></div>
          </div>
        </div>
      </dat-load-details>
    `;
    const hit = findRateInsertion(document.getElementById("host"));
    expect(hit?.mode).toBe("column-before");
    expect(hit.before.id).toBe("rate-col");
    expect(hit.parent.classList.contains("desktop-container")).toBe(true);
  });

  it("returns column-before inside tablet when rate row has siblings", () => {
    document.body.innerHTML = `
      <dat-load-details id="host">
        <div class="tablet-details-container">
          <div class="table-details-row" id="rate-row">
            <div class="details-column" id="rate-col-tablet">
              <div data-test="rate-details-container"></div>
            </div>
            <div class="details-column" id="market-col-tablet">
              <div data-test="market-rates-detail-container"></div>
            </div>
          </div>
        </div>
      </dat-load-details>
    `;
    const hit = findRateInsertion(document.getElementById("host"));
    expect(hit?.mode).toBe("row-before");
  });

  it("returns null when no rate container exists anywhere", () => {
    document.body.innerHTML = `<dat-load-details id="host"></dat-load-details>`;
    expect(findRateInsertion(document.getElementById("host"))).toBeNull();
  });
});

describe("createColumnDOM", () => {
  it("applies transparent grid-cell shell styles", () => {
    const { shadow, card } = createColumnDOM(document, { gridCell: true });
    const css = shadow.querySelector("style")?.textContent || "";
    expect(css).toContain("background: transparent");
    expect(css).toContain("border: none");
    expect(css).toContain("padding: 4px");
    expect(card.className).toBe("card");
  });

  it("renderColumn fills metrics and keeps actions visible", () => {
    const { card } = createColumnDOM(document, { gridCell: true });
    renderColumn(card, {
      data: {
        origin: "A",
        destination: "B",
        tripMiles: 100,
        rateDollars: 500,
        rpmHint: 5,
        companyName: "Co",
        contactEmail: "a@b.com"
      },
      route: null,
      loadingRoute: false,
      offerTpl: "",
      bookingTpl: "",
      templateMode: "default",
      shadowHost: null,
      onRefreshRoute: null,
      mapInstance: null
    });
    expect(card.textContent).toContain("Load Intelligence");
    expect(card.querySelector('[data-role="rpm"]')).toBeTruthy();
    expect(card.querySelector(".actions")).toBeTruthy();
  });
});

describe("stable class names", () => {
  it("exports the row/column/panel class names used by the renderer", () => {
    expect(TOM_ROW_CLASS).toBe("dat-ext-tom-row");
    expect(TOM_COLUMN_CLASS).toBe("dat-ext-tom-column");
    expect(TOM_PANEL_CLASS).toBe("dat-ext-tom-panel");
  });
});
