/**
 * @vitest-environment jsdom
 */

import { describe, expect, it } from "vitest";
import { resolveScanScopeFromMutations, shouldScheduleScanFromMutations } from "../src/mutation-gating.js";

const cfg = { injectedFlag: "dat-ext-injected", rootClass: "dat-ext-root" };

describe("shouldScheduleScanFromMutations", () => {
  it("ignores virtual-scroll content wrapper style churn", () => {
    const el = document.createElement("div");
    el.className = "cdk-virtual-scroll-content-wrapper";
    el.setAttribute("style", "transform: translateY(120px)");
    const mutations = [{ type: "attributes", attributeName: "style", target: el }];
    expect(shouldScheduleScanFromMutations(mutations, cfg)).toBe(false);
  });

  it("ignores class-only updates on decorated load rows", () => {
    const row = document.createElement("div");
    row.className = "row-container dat-ext-grid-row dat-ext-grid-row--pass";
    const mutations = [{ type: "attributes", attributeName: "class", target: row }];
    expect(shouldScheduleScanFromMutations(mutations, cfg)).toBe(false);
  });

  it("schedules on aria-expanded outside extension UI", () => {
    const btn = document.createElement("button");
    btn.setAttribute("aria-expanded", "true");
    const mutations = [{ type: "attributes", attributeName: "aria-expanded", target: btn }];
    expect(shouldScheduleScanFromMutations(mutations, cfg)).toBe(true);
  });

  it("schedules when non-extension nodes are added", () => {
    const div = document.createElement("div");
    div.className = "native-dat-node";
    const mutations = [{ type: "childList", addedNodes: [div], removedNodes: [] }];
    expect(shouldScheduleScanFromMutations(mutations, cfg)).toBe(true);
  });

  it("does not schedule when only extension-injected subtree is added", () => {
    const root = document.createElement("div");
    root.className = "dat-ext-root";
    const mutations = [{ type: "childList", addedNodes: [root], removedNodes: [] }];
    expect(shouldScheduleScanFromMutations(mutations, cfg)).toBe(false);
  });

  it("schedules when a non-extension node is removed", () => {
    const div = document.createElement("div");
    div.className = "native-row";
    const mutations = [{ type: "childList", addedNodes: [], removedNodes: [div] }];
    expect(shouldScheduleScanFromMutations(mutations, cfg)).toBe(true);
  });
});

describe("resolveScanScopeFromMutations", () => {
  it("returns the nearest row-container for row mutations", () => {
    const row = document.createElement("div");
    row.className = "row-container";
    const cell = document.createElement("div");
    cell.className = "table-cell cell-rate";
    row.appendChild(cell);

    const mutations = [{ type: "attributes", attributeName: "class", target: cell }];
    expect(resolveScanScopeFromMutations(mutations)).toBe(row);
  });

  it("returns dat-load-details when the detail host changes", () => {
    const detail = document.createElement("dat-load-details");
    const mutations = [{ type: "attributes", attributeName: "aria-expanded", target: detail }];
    expect(resolveScanScopeFromMutations(mutations)).toBe(detail);
  });
});
