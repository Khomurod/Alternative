/**
 * Traverse open shadow roots so scripts can reach Web Component interiors.
 */

/**
 * Depth-first walk including shadow roots (open only).
 * @param {Document|HTMLElement|ShadowRoot} start
 * @param {(node: Node) => void} visitor
 */
export function walkComposedTree(start, visitor) {
  if (!start) {
    return;
  }

  /** @type {(Document|HTMLElement|ShadowRoot|DocumentFragment)[]} */
  const stack = [start];

  while (stack.length) {
    const node = stack.pop();
    if (!node) {
      continue;
    }

    visitor(node);

    if (node instanceof HTMLElement && node.shadowRoot) {
      stack.push(node.shadowRoot);
    }

    let kids = [];
    if (node instanceof ShadowRoot || node instanceof HTMLElement || node instanceof DocumentFragment) {
      kids = [...node.children];
    } else if (node instanceof Document) {
      kids = [...node.children];
    }

    for (let index = kids.length - 1; index >= 0; index -= 1) {
      stack.push(kids[index]);
    }
  }
}

/**
 * Matches `selector` for every HTMLElement visited in the composed tree under `root`.
 * @param {Document|HTMLElement} root
 * @param {string} selector
 * @returns {Element[]}
 */
export function queryDeepAll(root, selector) {
  /** @type {Element[]} */
  const matches = [];

  const start =
    root instanceof Document ? root.body || root.documentElement || root : root;

  if (!(start instanceof HTMLElement) && !(start instanceof Document) && !(start instanceof ShadowRoot)) {
    return matches;
  }

  walkComposedTree(start, (node) => {
    if (!(node instanceof HTMLElement)) {
      return;
    }

    try {
      if (node.matches(selector)) {
        matches.push(node);
      }
    } catch {
      /* Invalid selector */
    }
  });

  return matches;
}
