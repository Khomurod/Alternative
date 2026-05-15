/**
 * @vitest-environment jsdom
 */

import { describe, expect, it } from "vitest";
import {
  injectLoadDetailDirectionAnchors,
  injectRowSummaryDirectionAnchors,
  ROW_DIR_ATTR,
  ROW_DIR_CONTEXT_ATTR
} from "../src/row-summary-directions.js";

describe("row summary directions anchors", () => {
  it("injects one button per row trip cell and avoids duplicates", () => {
    document.body.innerHTML = `
      <cdk-virtual-scroll-viewport id="table-viewport">
        <div class="cdk-virtual-scroll-content-wrapper">
          <div class="row-container">
            <div class="row-cells">
              <div data-test="load-trip-cell" class="cell-trip">
                <div class="trip-miles">406 mi</div>
              </div>
            </div>
          </div>
          <div class="row-container">
            <div class="row-cells">
              <div data-test="load-trip-cell" class="cell-trip">
                <div class="trip-miles">100 mi</div>
              </div>
            </div>
          </div>
        </div>
      </cdk-virtual-scroll-viewport>
    `;

    injectRowSummaryDirectionAnchors(document);
    injectRowSummaryDirectionAnchors(document);

    const buttons = document.querySelectorAll(`[${ROW_DIR_ATTR}][${ROW_DIR_CONTEXT_ATTR}="list"]`);
    expect(buttons.length).toBe(2);
  });

  it("prepends button with flex layout on miles parent", () => {
    document.body.innerHTML = `
      <cdk-virtual-scroll-viewport id="table-viewport">
        <div class="cdk-virtual-scroll-content-wrapper">
          <div class="row-container">
            <div class="row-cells">
              <div data-test="load-trip-cell" class="cell-trip">
                <span class="trip-miles">52 mi</span>
              </div>
            </div>
          </div>
        </div>
      </cdk-virtual-scroll-viewport>
    `;

    injectRowSummaryDirectionAnchors(document);
    const miles = document.querySelector(".trip-miles");
    const btn = document.querySelector(`[${ROW_DIR_ATTR}]`);
    expect(btn).toBeTruthy();
    const parent = miles?.parentElement;
    expect(parent?.style.display).toBe("flex");
    expect(parent?.style.alignItems).toBe("center");
    expect(miles?.previousElementSibling).toBe(btn);
    expect(btn?.getAttribute(ROW_DIR_CONTEXT_ATTR)).toBe("list");
  });

  it("injects one detail-header directions button left of trip miles", () => {
    document.body.innerHTML = `
      <dat-load-details id="d1">
        <dat-details-header>
          <div class="details-header_info">
            <div class="trip-miles">406 mi</div>
          </div>
        </dat-details-header>
      </dat-load-details>
    `;

    injectLoadDetailDirectionAnchors(document);
    injectLoadDetailDirectionAnchors(document);

    const miles = document.querySelector(".trip-miles");
    const detailBtn = document.querySelector(`[${ROW_DIR_ATTR}][${ROW_DIR_CONTEXT_ATTR}="detail"]`);
    expect(detailBtn).toBeTruthy();
    expect(miles?.previousElementSibling).toBe(detailBtn);
  });
});
