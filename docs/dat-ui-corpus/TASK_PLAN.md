# Task plan — learning `message.txt` with the split corpus

Use this as a **checklist** for any AI agent (or human) working from `docs/dat-ui-corpus/`. Check boxes as you complete items.

## Setup

- [ ] Read `README.md` for the file map and regeneration command.
- [ ] Confirm canonical full file exists: `message.txt` at repo root.
- [ ] For **extension implementation status**, open [`../EXTENSION_TASK_PLAN.md`](../EXTENSION_TASK_PLAN.md).

## Tier A — Fast context (under 15 minutes)

- [ ] `01-page-meta.md` — note `<title>`, `<html>` extension attributes, toolbar mode.
- [ ] `13-extension-footprint.md` — confirm `my-ext-global-tools` and `table-viewport` exist; read both HTML snippets.
- [ ] `10-selectors-data-test.md` — scan top `data-test` values for search/results/detail.

## Tier B — DOM regions (structural)

- [ ] `03-head-lines-002-191.html` — fonts/CDN only; low priority unless debugging global styles.
- [ ] `02-inline-css-line192-README.md` — understand why line 192 is huge; **do not** deep-read full CSS unless investigating a class name from snippets.
- [ ] `05-body-lines-251-320.html` — locate **tab header**, **injected toolbar**, **`cdk-virtual-scroll-viewport`**, first **`row-container`** samples.
- [ ] `04-body-lines-196-250.html` — map material leading into the search shell.

## Tier C — Row and grid semantics

- [ ] `06-body-lines-321-420.html` — additional `row-container` patterns, `dat-route`, `dat-company`, rate/trip cells.
- [ ] `07-body-lines-421-520.html` — continue row patterns; watch for `dat-ext-grid-row*` classes.
- [ ] `08-body-lines-521-620.html` — tail of results or secondary panels.
- [ ] `09-body-lines-621-END.html` — scripts, closing tags, late components.

## Tier D — Component vocabulary

- [ ] `11-custom-elements-dat.md` — list of `dat-*` tags to cross-check with `src/detail-panel.js` / future selectors.
- [ ] `12-custom-elements-cg.md` — shared Cargo design-system tags (usually less specific than `data-test`).

## Tier E — Optional deep CSS

- [ ] `02-inline-css-line192-HEAD.txt` — search for class names seen in overlap (from Tier B snippets).
- [ ] `02-inline-css-line192-TAIL.txt` — only if HEAD did not contain the rule.

## Deliverables (after learning)

- [ ] Short **structure note**: bullet list “region → parent selector → child of interest”.
- [ ] **Overlap diagnosis**: which native node is obscured; proposed new insertion anchor or CSS fix.
- [ ] **Parsing diagnosis**: which cell selectors differ from `src/dat-one-virtual.js` for this capture.

## Regenerate corpus when `message.txt` changes

- [ ] Run `node scripts/split-message-txt.mjs` from repo root (or `npm run split:dat-ui`).
- [ ] Diff `10`–`13` files against previous commit to spot DAT UI churn.
