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
  it("injects one button per row dat-route and avoids duplicates", () => {
    document.body.innerHTML = `
      <cdk-virtual-scroll-viewport id="table-viewport">
        <div class="cdk-virtual-scroll-content-wrapper">
          <div class="row-container">
            <div class="row-cells">
            <dat-route>
              <div class="trip-icon-container">
                <div class="trip-miles">406 mi</div>
              </div>
            </dat-route>
            </div>
          </div>
          <div class="row-container">
            <div class="row-cells">
            <dat-route>
              <div class="trip-icon-container">
                <div class="trip-miles">100 mi</div>
              </div>
            </dat-route>
            </div>
          </div>
        </div>
      </cdk-virtual-scroll-viewport>
    `;

    injectRowSummaryDirectionAnchors(document);
    injectRowSummaryDirectionAnchors(document);

    const buttons = document.querySelectorAll(`[${ROW_DIR_ATTR}]`);
    expect(buttons.length).toBe(2);
    buttons.forEach((b) => expect(b.getAttribute(ROW_DIR_CONTEXT_ATTR)).toBe("list"));
  });

  it("inserts before trip-miles when trip-icon-container is absent", () => {
    document.body.innerHTML = `
      <cdk-virtual-scroll-viewport id="table-viewport">
        <div class="cdk-virtual-scroll-content-wrapper">
          <div class="row-container">
            <div class="row-cells">
            <dat-route>
              <div class="route-dh-container-lg">
                <span class="trip-miles">52 mi</span>
              </div>
            </dat-route>
            </div>
          </div>
        </div>
      </cdk-virtual-scroll-viewport>
    `;

    injectRowSummaryDirectionAnchors(document);
    const miles = document.querySelector(".trip-miles");
    const btn = document.querySelector(`[${ROW_DIR_ATTR}]`);
    expect(btn).toBeTruthy();
    expect(miles?.parentElement?.firstElementChild).toBe(btn);
    expect(btn?.getAttribute(ROW_DIR_CONTEXT_ATTR)).toBe("list");
  });

  it("injects one detail-header directions button per dat-load-details and avoids duplicates", () => {
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

    const detailBtns = document.querySelectorAll(`[${ROW_DIR_ATTR}][${ROW_DIR_CONTEXT_ATTR}="detail"]`);
    expect(detailBtns.length).toBe(1);
  });
});
