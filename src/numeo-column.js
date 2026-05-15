export const TOM_ROW_CLASS = "dat-ext-tom-row";
export const TOM_COLUMN_CLASS = "dat-ext-tom-column";
export const TOM_PANEL_CLASS = "dat-ext-tom-panel";
export const TOM_ANCHOR_ATTR = "data-dat-ext-tom-anchor";

/**
 * @typedef {Object} TabletRowInsertion
 * @property {"row-before"} mode
 * @property {HTMLElement} parent   - tablet container (parent of rate row)
 * @property {HTMLElement} before   - the rate `.table-details-row` to insert before
 * @property {HTMLElement} surface  - same as parent (used for cleanup scope)
 *
 * @typedef {Object} DesktopColumnInsertion
 * @property {"column-before"} mode
 * @property {HTMLElement} parent   - flex row (e.g. `.desktop-container`) that contains rate column
 * @property {HTMLElement} before   - the column element that contains the rate block
 * @property {HTMLElement} surface  - root detail container for cleanup scope
 *
 * @typedef {TabletRowInsertion | DesktopColumnInsertion} Insertion
 */

/**
 * Choose where to inject the assist surface for an expanded `dat-load-details` host.
 *
 * Supports two real DAT layouts:
 *
 *  - **tablet** (`.tablet-details-container` with stacked `.table-details-row` children):
 *    insert a new full-width row immediately before the rate row.
 *  - **desktop** (horizontal flex row of columns where one column wraps the rate block):
 *    insert a new column immediately before the rate column inside that flex row.
 *
 * @param {HTMLElement} detailHost
 * @returns {Insertion | null}
 */
export function findRateInsertion(detailHost) {
  if (!(detailHost instanceof HTMLElement)) {
    return null;
  }

  const rateEl = detailHost.querySelector('[data-test="rate-details-container"]');
  if (!(rateEl instanceof Element)) {
    return null;
  }

  // 1) Tablet layout — same-row stacking.
  const tabletContainer = detailHost.querySelector(".tablet-details-container");
  if (tabletContainer instanceof HTMLElement && tabletContainer.contains(rateEl)) {
    const rateRow = rateEl.closest(".table-details-row");
    if (rateRow instanceof HTMLElement && rateRow.parentElement === tabletContainer) {
      // If that row already has multiple `.details-column` siblings, we can place a NEW
      // column right before the one holding the rate.
      const rateColumnInRow = closestChildOf(rateEl, rateRow);
      if (rateColumnInRow && countElementChildren(rateRow) >= 2 && rateColumnInRow !== rateRow.firstElementChild) {
        return {
          mode: "column-before",
          parent: rateRow,
          before: rateColumnInRow,
          surface: tabletContainer
        };
      }
      return {
        mode: "row-before",
        parent: tabletContainer,
        before: rateRow,
        surface: tabletContainer
      };
    }
  }

  // 2) Desktop layout — flex row of columns. We assume the rate's column ancestor's
  //    parent is a horizontal flex container with at least two siblings.
  const desktopColumn =
    rateEl.closest(".desktop-column") ??
    rateEl.closest(".details-column") ??
    closestColumnLike(rateEl);
  if (desktopColumn instanceof HTMLElement) {
    const parent = desktopColumn.parentElement;
    if (parent instanceof HTMLElement && countElementChildren(parent) >= 2 && desktopColumn !== parent.firstElementChild) {
      return {
        mode: "column-before",
        parent,
        before: desktopColumn,
        surface: parent
      };
    }
  }

  return null;
}

/**
 * Back-compat alias retained for the previous tablet-only API and tests.
 *
 * @param {HTMLElement} detailHost
 * @returns {{ tabletContainer: HTMLElement, rateRow: HTMLElement } | null}
 */
export function findRateRowInsertion(detailHost) {
  const insertion = findRateInsertion(detailHost);
  if (!insertion || insertion.mode !== "row-before") {
    return null;
  }
  return { tabletContainer: insertion.parent, rateRow: insertion.before };
}

/**
 * @param {ParentNode | null | undefined} scope
 */
export function removeAllTomRows(scope) {
  if (!scope) {
    return;
  }
  for (const row of scope.querySelectorAll(`.${TOM_ROW_CLASS}`)) {
    row.remove();
  }
  for (const col of scope.querySelectorAll(`.${TOM_COLUMN_CLASS}`)) {
    col.remove();
  }
}

/**
 * Walk up from `node` until we find the element whose direct parent is `parent`.
 *
 * @param {Element} node
 * @param {Element} parent
 * @returns {HTMLElement | null}
 */
function closestChildOf(node, parent) {
  let current = node;
  while (current && current.parentElement && current.parentElement !== parent) {
    current = current.parentElement;
  }
  return current instanceof HTMLElement && current.parentElement === parent ? current : null;
}

/**
 * @param {Element} parent
 */
function countElementChildren(parent) {
  let n = 0;
  for (let child = parent.firstElementChild; child; child = child.nextElementSibling) {
    n += 1;
  }
  return n;
}

/**
 * Heuristic "column-like" ancestor of a rate cell when DAT renders without the canonical
 * column classes. We accept any ancestor whose parent has at least two element children
 * and whose tag is a block-level wrapper.
 *
 * @param {Element} node
 * @returns {HTMLElement | null}
 */
function closestColumnLike(node) {
  let current = node?.parentElement ?? null;
  let depth = 0;
  while (current instanceof HTMLElement && depth < 8) {
    const parent = current.parentElement;
    if (parent instanceof HTMLElement && countElementChildren(parent) >= 2) {
      return current;
    }
    current = parent;
    depth += 1;
  }
  return null;
}
