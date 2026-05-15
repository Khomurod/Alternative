# Screenshot Clone Audit + Implementation Plan

## Target screenshot (requested clone)

The target view has three critical zones:

1. **Top search chrome remains native DAT-like**  
   - Origin / destination / equipment / date range / Search button row is visually untouched.
   - No large extension card occupying this area.

2. **Compact extension controls row under search/filter chips**  
   - Left cluster: email integration + template controls (`Connect Email`, active email, template chooser).
   - Right cluster: compact controls (`Rate`, `RPM`, `Miles`, `Weight`, `Ignored (n)`, `Apply`).
   - Controls are small, inline, and do not create vertical bloat.

3. **Compact intelligence strip in expanded detail row (between Trip and Rate)**  
   - Label: `Numeo Load Intelligence`.
   - Two inline actions: `Send Offer Email`, `Send Booking Email`.
   - Compact metric fields in the same strip; no oversized card dominating the row.

---

## Current app audit vs screenshot

## 1) Search chrome / top area

- **Current state:** injects a large full-width card `#my-ext-global-tools` inside `.search-controls` with summary chips + target fields.
- **Gap:** screenshot expects a compact inline control row, not a large top card.
- **Severity:** High (primary visual mismatch).

## 2) Extension control model (top)

- **Current state:** supports `Target Rate`, `Target RPM`, `Only show matches` and summary stats.
- **Gap:** screenshot requires additional compact fields and flow:
  - `Miles`, `Weight`
  - `Ignored (n)` tracking
  - explicit `Apply` action
  - inline email/template controls in-page.
- **Severity:** High (feature + layout mismatch).

## 3) Detail intelligence strip

- **Current state:** inserts a Shadow DOM card with actions, RPM/RATE/MILES, toll button, and map area.
- **Gap:** target screenshot shows a tighter inline strip style and naming (`Numeo Load Intelligence`) with minimal visual weight.
- **Severity:** Medium-High (close functionally, not close visually).

## 4) Email/template experience

- **Current state:** template editing exists in extension popup (`popup.html` + storage), send buttons in detail panel exist.
- **Gap:** screenshot uses visible in-page email/template controls near results header.
- **Severity:** Medium.

## 5) Data/parsing parity

- **Current state:** DAT virtual rows and detail parsing are robust; recently fixed:
  - listener rebinding leak
  - false RPM parse from `406 mi`
  - detail RPM/miles fallback to DAT trip when route missing.
- **Gap:** none blocking for screenshot clone; parsing can be reused.
- **Severity:** Low.

---

## Clone plan (phased)

## Phase 0 — Safety rails and baseline

1. Add feature flag `datExtCloneScreenshotUI` (default `false`).
2. Keep current UI path untouched while clone path is developed.
3. Capture baseline screenshots from:
   - current extension mode
   - clone mode (WIP) for iterative visual diff.

## Phase 1 — Replace top card with compact header row

1. Introduce new mount container (separate from large `#my-ext-global-tools`) anchored beneath native filter chips / above results table.
2. Build two inline clusters:
   - **Left:** email connect status + selected template control.
   - **Right:** compact inputs (`Rate`, `RPM`, `Miles`, `Weight`) + `Ignored (n)` + `Apply`.
3. Keep dimensions small and single-row at desktop widths; wrap gracefully on narrow screens.
4. Remove large summary-card visuals in clone mode.

## Phase 2 — Behavior parity for compact controls

1. Change from “always-live recompute” to **Apply-driven update** for clone mode.
2. Add ignored-lane state model:
   - row-level ignore toggles
   - persisted count shown as `Ignored (n)`.
3. Preserve existing evaluate/classify logic for scoring, but gate by Apply.
4. Persist clone control values in local storage (new key namespace).

## Phase 3 — Detail strip redesign (compact Numeo look)

1. Convert current detail card to compact strip-first layout:
   - heading text `Numeo Load Intelligence`
   - inline email buttons
   - inline RPM/RATE/MILES fields
2. Keep map and toll capabilities as secondary/collapsible content (not dominant by default).
3. Keep existing route + mail logic; only change presentation structure and default visibility.

## Phase 4 — In-page template controls

1. Add in-page template selector tied to existing storage keys.
2. Keep popup as fallback editor, but expose active template and quick switch in header row.
3. Add connect-email indicator UI in row (state-aware; if OAuth is not implemented, keep “connect” as non-destructive placeholder/launch point).

## Phase 5 — Test + visual QA gate

1. Unit tests:
   - compact control state model
   - ignored count logic
   - apply gating behavior
2. DOM tests:
   - clone mode renders compact row and no large top card
   - detail strip compact markup present
3. Manual QA:
   - no overlap with native DAT top controls
   - expected wrapping at smaller widths
   - scroll stability (no flicker regression)
   - email/template actions still function.

---

## Execution checklist

- [x] Add clone feature flag and branch logic (skipped toggle; shipped as default replacement per request)
- [x] Implement compact top row shell + CSS tokens
- [x] Implement compact controls + Apply workflow
- [x] Implement ignored state/count model
- [x] Implement compact detail strip UI
- [x] Expose in-page template controls
- [x] Add/adjust tests
- [x] Run `npm.cmd test`
- [x] Run `npm.cmd run build`
- [ ] Manual visual pass against screenshot

---

## Notes on “exact clone”

- Functional and layout parity is feasible.
- If this is for internal/private use, exact naming/visual mimic is straightforward.
- If this is for distribution/public release, keep an alternate branding toggle to avoid third-party trademark/style conflicts.
