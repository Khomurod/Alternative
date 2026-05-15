import { DAT_EXT_GRID_ROW_MARK } from "./row-deco-key.js";

const CDK_CONTENT_WRAPPER = "cdk-virtual-scroll-content-wrapper";
const ROW_CONTAINER = "row-container";

/**
 * Decide whether DOM mutations warrant a full assist rescan.
 * Filters high-frequency noise (virtual scroll transform, row parity classes, our own row marks).
 *
 * @param {MutationRecord[]} mutations
 * @param {{ injectedFlag: string, rootClass: string }} config
 * @returns {boolean}
 */
export function shouldScheduleScanFromMutations(mutations, config) {
  const { injectedFlag, rootClass } = config;

  for (const mutation of mutations) {
    if (mutation.type === "attributes" && mutation.target instanceof HTMLElement) {
      const el = mutation.target;
      if (el.classList.contains(injectedFlag) || el.closest(`.${rootClass}`)) {
        continue;
      }

      const name = mutation.attributeName;
      if (name === "style" && el.classList.contains(CDK_CONTENT_WRAPPER)) {
        continue;
      }

      if (
        name === "class" &&
        (el.classList.contains(ROW_CONTAINER) || el.classList.contains(DAT_EXT_GRID_ROW_MARK))
      ) {
        continue;
      }

      return true;
    }

    for (const node of mutation.addedNodes) {
      if (!(node instanceof HTMLElement)) {
        continue;
      }

      if (node.classList.contains(injectedFlag)) {
        return false;
      }

      if (node.closest(`.${rootClass}`)) {
        continue;
      }

      return true;
    }

    for (const node of mutation.removedNodes) {
      if (!(node instanceof HTMLElement)) {
        continue;
      }

      if (node.classList.contains(injectedFlag)) {
        return false;
      }

      if (node.closest(`.${rootClass}`)) {
        continue;
      }

      return true;
    }
  }

  return false;
}

/**
 * Narrow DOM scans to the subtree that triggered a mutation (virtual row, viewport, or detail host).
 *
 * @param {MutationRecord[]} mutations
 * @returns {HTMLElement | null}
 */
export function resolveScanScopeFromMutations(mutations) {
  for (const mutation of mutations) {
    const scopeFromTarget = resolveScanScopeFromNode(mutation.target);
    if (scopeFromTarget) {
      return scopeFromTarget;
    }

    for (const node of mutation.addedNodes) {
      const scopeFromAdded = resolveScanScopeFromNode(node);
      if (scopeFromAdded) {
        return scopeFromAdded;
      }
    }

    for (const node of mutation.removedNodes) {
      const scopeFromRemoved = resolveScanScopeFromNode(node);
      if (scopeFromRemoved) {
        return scopeFromRemoved;
      }
    }
  }

  return null;
}

/**
 * @param {Node | null | undefined} node
 * @returns {HTMLElement | null}
 */
function resolveScanScopeFromNode(node) {
  if (!(node instanceof Element)) {
    return null;
  }

  if (node instanceof HTMLElement && node.matches("dat-load-details")) {
    return node;
  }

  const rowContainer = node.closest(".row-container");
  if (rowContainer instanceof HTMLElement) {
    return rowContainer;
  }

  const viewport = node.closest(
    "#table-viewport, cdk-virtual-scroll-viewport, [data-test='results-table-body']"
  );
  if (viewport instanceof HTMLElement) {
    return viewport;
  }

  if (
    node instanceof HTMLElement &&
    (node.classList.contains(CDK_CONTENT_WRAPPER) ||
      node.id === "table-viewport" ||
      node.matches("cdk-virtual-scroll-viewport"))
  ) {
    return node;
  }

  return null;
}
