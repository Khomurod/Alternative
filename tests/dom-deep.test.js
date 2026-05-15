/**
 * @vitest-environment jsdom
 */

import { describe, expect, it } from "vitest";
import { queryDeepAll, walkComposedTree } from "../src/dom-deep.js";

describe("dom-deep", () => {
  it("discovers nodes inside open shadow roots", () => {
    document.body.innerHTML = `<div id="host"></div>`;
    const host = document.getElementById("host");
    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = `
      <table id="shadow-table">
        <thead><tr><th>A</th></tr></thead>
        <tbody><tr><td>1</td></tr></tbody>
      </table>
    `;

    expect(document.querySelectorAll("table").length).toBe(0);

    const hits = queryDeepAll(document, "table");
    expect(hits.length).toBe(1);
    expect(hits[0].id).toBe("shadow-table");
  });

  it("walkComposedTree visits shadow content", () => {
    document.body.innerHTML = `<div id="host"></div>`;
    const host = document.getElementById("host");
    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = `<div id="inner"></div>`;

    /** @type {string[]} */
    const ids = [];

    walkComposedTree(document.body, (node) => {
      if (node instanceof HTMLElement && node.id) {
        ids.push(node.id);
      }
    });

    expect(ids).toContain("host");
    expect(ids).toContain("inner");
  });
});
