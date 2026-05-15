# DAT Dispatcher Assist — implementation plan (living document)

This plan ties the **product goals**, **DOM reality** (see `docs/dat-ui-corpus/`), and **code modules**. Update it when DAT ships UI changes or when new features land.

## Architecture snapshot

| Layer | Responsibility |
| --- | --- |
| `content-entry.js` | Bootstrap, `MutationObserver`, toolbar injection, scan orchestration |
| `mutation-gating.js` | Filters mutation noise so scans are not fired on every virtual-scroll tick |
| `grid.js` / `dat-one-virtual.js` | Find results surface, parse cells, classify rows, optional hide non-matches |
| `row-deco-key.js` | Stable key for **idempotent** row decoration (skip DOM writes when state unchanged) |
| `parsers.js` | Header/cell parsing, target evaluation, `resolveDetailPanelRpm` for detail view |
| `detail-panel.js` | `dat-load-details` panel, route inspector hook, render cache |
| `routing.js` + `background.js` | Geocode + OSRM (allowlisted fetch via service worker) |
| `styles.css` | Toolbar + panel + row chrome |

## Phase 1 — Stability and perceived performance (completed in tree)

**Problem:** List “blinking” from (a) observer firing on CDK scroll `style` and row `class` churn, (b) unconditional `classList` / `replaceChildren` every scan.

**Implementation:**

1. **`shouldScheduleScanFromMutations`** (`mutation-gating.js`)  
   - Ignore `style` mutations on `.cdk-virtual-scroll-content-wrapper`.  
   - Ignore `class` mutations on `.row-container` and `.dat-ext-grid-row`.  
   - Treat `removedNodes` like `addedNodes` for scheduling (virtual scroll removes rows).  
   - Still schedule on meaningful `aria-*` and structural changes outside extension UI.

2. **Idempotent row decoration** (`buildRowDecorationStateKey` in `row-deco-key.js`)  
   - After computing status/RPM/hidden, compare to `row.dataset.datExtDecoKey`.  
   - Skip `clearRowMarks` / `classList.add` / `title` update when unchanged.  
   - Summary counters still update every pass (cheap).

3. **Detail panel render cache** (`detail-panel.js`)  
   - `dataset.datExtRenderKey` from data + route + targets + loading flag.  
   - Skip `replaceChildren` when identical (reduces flicker on rapid rescans).  
   - Clear render key when load `signature` changes.

## Phase 2 — RPM semantics (detail panel) (completed)

**Problem:** Users expected “independent” RPM from **routed miles**, not broker `*/mi` hint.

**Implementation:** `resolveDetailPanelRpm` in `parsers.js` — when OSRM/estimated `adjustedMiles` exists, **rate ÷ road miles**; else DAT trip; else hint. Grid rows unchanged (per-row routing would be prohibitive).

## Phase 3 — Toolbar vs DAT layout (earlier work, keep verified)

- Toolbar **appended** after native `.search-controls` children; full-width strip CSS.  
- `syncNativeHeaderStyles` skips `#my-ext-global-tools` inputs when copying MAT field metrics.

## Phase 4 — Operator UX (partial)

| Item | Status |
| --- | --- |
| **Extension popup** + `chrome.storage.local` for **Offer** / **Booking** email body templates | Done (`popup.html`, bundled `popup.js`, `src/email-template.js`, manifest `storage` + `default_popup`) |
| Placeholders `{{company}}`, `{{origin}}`, `{{destination}}`, `{{email}}` | Done |
| Gmail OAuth / “Sign in with Google” | Not implemented (store review + scopes) |
| Multi-leg RPM | Not implemented |

## Verification

- `npm test` — unit + DOM fixtures.  
- `npm run build` — ship `content.js`.  
- Manual on DAT: scroll list, toggle row expand, confirm no strobe; open detail and confirm RPM uses routed miles when loaded.

## References

- `docs/dat-ui-corpus/` — frozen DOM captures and selector inventories  
- `docs/FINAL_AUDIT_CHECKLIST.md` — pre-release manual pass  
