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
