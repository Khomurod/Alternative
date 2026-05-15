# Implementation plan — DAT UI corpus and extension alignment

> **Extension engineering plan (phases, completed work, roadmap):** see [`../EXTENSION_IMPLEMENTATION_PLAN.md`](../EXTENSION_IMPLEMENTATION_PLAN.md).  
> **Task checklist:** [`../EXTENSION_TASK_PLAN.md`](../EXTENSION_TASK_PLAN.md).  
> **Pre-release QA:** [`../FINAL_AUDIT_CHECKLIST.md`](../FINAL_AUDIT_CHECKLIST.md).

This document focuses on **learning the captured DOM** (`message.txt`, split under this folder) to align selectors and layout hypotheses.

## Phase 0 — Orient (no code)

- Confirm which DAT surface the capture represents (document `<title>` and left-nav context from the user’s session).
- Read `01-page-meta.md` and `13-extension-footprint.md` to see **where** the extension touches the DOM (`data-dat-ext-*` on `<html>`, `my-ext-global-tools`, `dat-ext-grid-row` on rows).
- Skim `10-selectors-data-test.md` for stable `data-test` hooks the app can prefer over class names.

## Phase 1 — Structure map (read-only)

- Parse body chunks `04`–`09` mentally (or in notes) into regions: **shell / nav**, **search chrome**, **results header**, **`cdk-virtual-scroll-viewport`**, **row-container**, **drawers/modals**.
- Identify the **native host** into which `my-ext-global-tools` is inserted (parent chain in the chunk that contains `my-ext-global-tools`).
- Note **stacking** suspects: `position: sticky|fixed`, high `z-index`, `transform` on ancestors (often breaks `position: fixed` children).

## Phase 2 — Hypotheses for current bugs

- **Overlap**: toolbar host width vs. DAT flex layout; extension panel width; missing `flex-shrink` / `min-width: 0` on native or injected nodes; wrong insertion point (too high in DOM = covers filter row).
- **RPM / miles “wrong”**: trip/rate cells not parsed on **Search Leads** vs **Search Loads** column layout; `parseTripCell` / `parseRateCell` mismatch for cell text; routing blocked (background fetch) vs. UI issue.

## Phase 3 — Targeted code changes (extension)

- **Injection**: adjust `findSearchChromeHost` / insertion logic in `src/content-entry.js` to attach the toolbar to a **non-overlapping** container or switch to a **docked** UI (e.g. below filters, or fixed top with offset from DAT sticky header once measured).
- **Layout/CSS**: update `styles.css` for toolbar max-width, wrapping, `z-index`, and responsive breakpoints using `data-dat-ext-toolbar-mode` already set on `<html>`.
- **Grid parsing**: extend `src/dat-one-virtual.js` / `src/grid.js` for **Search Leads** column/order differences if inventories show different `data-test` or cell classes.
- **Detail / routing**: verify `dat-load-details` presence in capture; align `src/detail-panel.js` selectors with `11-custom-elements-dat.md`.

## Phase 4 — Verify

- Re-capture DOM after changes (new `message.txt` or a dated file) and re-run `node scripts/split-message-txt.mjs`.
- Manual pass on DAT: no covered Rate/Trip columns; RPM populates when rate + miles exist; route inspector completes or surfaces errors visibly.

## Phase 5 — Maintenance

- Keep **one canonical capture** per major DAT UI release (filename dated).
- Prefer **inventories** (`10`–`12`) for quick diff between captures rather than re-reading multi‑MB HTML.
