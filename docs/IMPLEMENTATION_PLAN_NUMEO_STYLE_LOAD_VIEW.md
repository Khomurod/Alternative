# Implementation plan: Numeo-style load detail column (“clone”)

This document describes how to **replicate the class of UX** shown in reference screenshots (dedicated middle column: branded header, **Send Offer / Send Booking** actions, **RPM $ / RATE $ / MILES** fields, **Get Tolls**, **embedded map**, while DAT’s native **Trip**, **Rate (iQ)**, and **Company** columns remain).  

**Scope note:** “Clone” means **behavioral and layout parity to the extent legally and technically feasible**, not copying third-party source code or trademarks. Product name, exact styling, and proprietary routing/toll stacks would be **original** or **properly licensed**.

**Constraint from request:** No repo code changes were made to implement this plan; this file is planning only.

---

## 0. Goals and non-goals

### 0.1 Primary goals

1. **Layout:** On expanded load detail, present a **persistent vertical column** between DAT’s existing **Trip** block and **Rate / market** block, matching the **visual grid** of the reference (full height of detail area, not only a single “Lane Intelligence” row).
2. **Map:** **In-page** interactive map (pan/zoom) showing a **polyline** for the priced lane (minimum: O→D; stretch: multi-leg).
3. **Numbers:** **Editable** (or semi-editable) **RATE $**, **MILES**, **RPM $** with clear rules for **which mile basis** drives RPM (user-visible, reconcilable with DAT’s trip miles where possible).
4. **Tolls:** User-triggered **“Get Tolls”** (or auto on demand) with **clear attribution** and **fallback** when unavailable.
5. **Email:** Offer / booking actions at least as capable as today (`mailto:` + templates), with an **optional** path to **Gmail compose** or **Gmail API** later.
6. **Stability:** No continuous list blink; **minimal** conflict with DAT’s virtual DOM and Angular change detection.

### 0.2 Explicit non-goals (initial release)

1. **Not** replicating another vendor’s **brand**, **exact map style**, or **proprietary** toll/routing black box without license.
2. **Not** replacing DAT’s own **Market Rates (iQ)** or **Company** column—those stay native unless DAT DOM makes coexistence impossible.
3. **Not** guaranteeing **numeric parity** with DAT’s “Trip: 473 mi” when the product definition intentionally uses **different legs** (document divergence instead of fighting it).

---

## 1. Discovery and product definition (Phase A)

### 1.1 Reference capture (internal)

| Task | Detail | Output |
|------|--------|--------|
| A.1 | Freeze DOM for **expanded load** on same SKU as reference (Search Loads vs Leads, same browser width) | New `message.txt` or corpus slice under `docs/dat-ui-corpus/` |
| A.2 | Record **computed layout** for Trip / Rate / Company: `display`, `flex-direction`, `flex`, `grid-template`, `order`, `min-width` on each column host | Markdown table + screenshots |
| A.3 | Identify **lowest common ancestor** of Trip column root and Rate column root (selector + depth) | Single “layout host” candidate for sibling injection |
| A.4 | List **all** `data-test` and stable attributes on detail containers | Selector inventory |

### 1.2 Mile definitions (product — must be decided before engineering)

Pick **one primary** and optional **secondary** for UI labels:

| ID | Definition | Typical use |
|----|------------|-------------|
| M1 | **DAT posted trip** (from DAT detail / row) | Baseline comparison “what broker posted” |
| M2 | **O→D OSRM** (current extension logic, one leg) | Independent loaded miles |
| M3 | **Search origin → pickup** + **pickup → delivery** (two OSRM calls) | Dispatcher-centric “true cost” miles |
| M4 | **Truck GPS / HOS** (future) | Not v1 |

**Acceptance:** UI always shows **which M** is selected; changing selection **recomputes RPM** and updates map polyline(s).

### 1.3 RPM definition

- **RPM display** = `RATE $ / MILES` where **MILES** follows active M* definition (not silent mix).
- **Broker `*/mi`** in DAT cells may be shown as **read-only reference** line (“DAT / broker hint”) to avoid confusion.

### 1.4 Legal / compliance

| Item | Action |
|------|--------|
| DAT Terms of Use | Review automation, injection, scraping, and **map tile** usage |
| Map provider ToS | Store attribution string; respect tile usage limits |
| Toll API | Commercial terms + attribution |
| Chrome Web Store | Updated privacy policy, host permissions justification, data handling disclosure |

**Exit criterion for Phase A:** Signed-off **PRD** (2–4 pages) with M1–M3 behavior, error states, and “no parity guarantee” copy for users.

---

## 2. Architecture options (Phase B)

### 2.1 Injection strategies (choose after A.3)

| Strategy | Pros | Cons |
|----------|------|------|
| **B1: Sibling column inside DAT flex row** | Feels native, aligns with reference | Brittle if DAT changes flex; must use `order` or wrapper |
| **B2: Fixed / sticky overlay column** | Less DOM coupling | Covers DAT on resize; z-index wars |
| **B3: Resize native columns + insert** | Uses same row | May break DAT min-width assumptions |

**Recommendation:** Prototype **B1** first on captured DOM; fall back to **B2** only if B1 breaks across breakpoints.

### 2.2 Map embedding options

| Option | Pros | Cons |
|--------|------|------|
| **Leaflet** + OSM tiles | Open, familiar | Tile usage policy; attribution; CSP |
| **MapLibre GL** | Vector styling | Bundle size; GL context |
| **iframe** to hosted map app | Isolates CSP | UX friction; still need API key for some providers |
| **Static map image** | Simple | Not “clone” feel |

**Recommendation:** **Leaflet** in a **shadow root** or namespaced container to reduce CSS bleed; lazy-init map only when detail opens.

### 2.3 Extension surface split

| Piece | Where it runs | Why |
|-------|----------------|-----|
| Column UI + map + inputs | **Content script** on `dat.com` | Needs DOM |
| Heavy toll / batch routing | **Service worker** or **offscreen document** (MV3) | Avoid blocking content thread; unify fetch |
| API keys (if any) | **NOT** in content script for secrets | Use message passing; minimal exposure |

---

## 3. Manifest and permissions (Phase C)

### 3.1 New / changed manifest capabilities (inventory)

| Capability | Purpose |
|------------|---------|
| Existing `*://*.dat.com/*` | Page access |
| **New** tile CDN host(s) | e.g. `*.tile.openstreetmap.org` or commercial tiles |
| **New** toll API origin(s) | Provider-specific |
| **Optional** `offscreen` | Long routing batch |
| **`storage`** | Already present; extend for column prefs, map center, last M* |
| **OAuth2** (later) | Gmail send — separate sub-project |

### 3.2 `web_accessible_resources`

If map or iframe needs packaged assets, list them explicitly.

### 3.3 `content_scripts`

- Consider **`all_frames`:** audit which frames host `dat-load-details`; possibly **limit** to main frame only to reduce double injection.

**Exit criterion for Phase C:** Manifest diff reviewed; **principle of least privilege** for each new host.

---

## 4. DOM engineering — detail column (Phase D)

### 4.1 Host selection algorithm (pseudocode-level)

1. From `dat-load-details` (or equivalent host), find `tablet-details-container` (already used today).
2. Walk children to locate:
   - node **T** = root of “Trip” column content (heuristic: contains `route-details`, `VIEW ROUTE`, equipment block),
   - node **R** = root of “Rate / market” column (heuristic: contains `rate-details-container` or iQ branding text).
3. Find **LCA** (lowest common ancestor) of **T** and **R** with `display: flex` or `grid` and horizontal direction.
4. If LCA is a flex row:
   - Create wrapper `div.dat-ext-column-shell` with `display: contents` **or** insert a new flex child **between** T and R with `flex: 0 0 <width>px; min-width: …; max-width: …`.
5. If structure is CSS grid:
   - Use **`grid-column`** insertion (may require assigning `grid-template-columns` on a new wrapper—higher risk).

### 4.2 Responsive behavior

| Breakpoint | Behavior |
|------------|----------|
| Wide | Three-column: Trip \| **Assist** \| Rate \| Company |
| Medium | **Collapse** assist to tab “Assist” inside detail, or bottom sheet |
| Narrow | Full-width sheet below trip |

**Acceptance:** No overlap of DAT “Rate” column; no horizontal scroll beyond DAT’s own limits.

### 4.3 CSS isolation

- **Prefix** all classes `dat-ext-col--*`
- Consider **Shadow DOM** for the column root (open shadow) to block DAT style leakage; tradeoff: Leaflet may need **slots** or `part` styling
- **ResizeObserver** on host to reflow map

### 4.4 Lifecycle

| Event | Action |
|-------|--------|
| Detail opens | Mount column, init map once |
| Detail `signature` change (new load) | Tear down map, clear polylines, re-fetch routes |
| Detail closes / component destroyed | `map.remove()`, disconnect observers tied to column |

**Exit criterion for Phase D:** Works on **two** DAT layout variants (from corpus + live) without console errors.

---

## 5. Map module (Phase E)

### 5.1 Data pipeline

1. Parse **origin / destination** (reuse `sanitizeLocationText`, `parseCityState`).
2. Optional: parse **pickup** window text; geocode intermediate if M3.
3. Fetch coordinates (existing: `cities.json` → Photon → Nominatim).
4. Build polyline:
   - **M2:** one OSRM route → decode geometry if `overview=full` **or** draw straight line between coords if lightweight mode.
5. Render on Leaflet: `L.polyline(latlngs).addTo(map)`; fit bounds.

### 5.2 OSRM request shape (decision)

| Mode | `overview` | Use |
|------|--------------|-----|
| Cheap | `false` | Miles only; map uses geodesic or simplified line |
| Rich | `simplified` / `full` | True road shape on map; larger payload |

### 5.3 Attribution

- OSM + OSRM + (if used) Photon/Nominatim strings in footer of column.

**Exit criterion for Phase E:** Map shows correct **state-level** shape for 5 test lanes; offline behavior defined.

---

## 6. Tolls (Phase F)

### 6.1 Provider selection

Evaluate vendors (HERE, TollGuru, Google Routes with tolls, etc.) on: **coverage**, **price**, **TOS**, **HTTPS**, **latency**.

### 6.2 UX

- **Get Tolls** button → loading state → show **total** + breakdown table (cash vs tag if available) + **disclaimer**.
- Cache by `(laneKey, provider, date)` in `chrome.storage.local` with TTL.

### 6.3 Failure modes

- API key missing → disabled button + tooltip
- Timeout → retry once → graceful message

**Exit criterion for Phase F:** Tolls path works in **one** pilot region; documented when “N/A”.

---

## 7. RATE / MILES / RPM fields (Phase G)

### 7.1 Field binding

| Field | Source | User edit |
|-------|--------|-------------|
| RATE $ | `parseRateCell` from DAT | Yes (override); “Reset to DAT” |
| MILES | Active M* (M1/M2/M3) | Yes (manual override flag); “Reset to model” |
| RPM $ | Derived = RATE / MILES unless user locks RPM | Lock toggles: “derive from rate” vs “derive from RPM” |

### 7.2 Conflict with DAT

- Show **DAT trip** (M1) as read-only line when M2/M3 selected and numbers differ.

### 7.3 Persistence

- Optional: remember last overrides per `laneKey` in session storage only (avoid wrong persistence across loads).

**Exit criterion for Phase G:** User can reproduce **Numeo-like** “559 vs 473” **intentionally** and understand why.

---

## 8. Email actions (Phase H)

### 8.1 v1 (low risk)

- Keep **`mailto:`**; prefill subject/body from **popup templates** (already in product).
- Add **“Open in Gmail web”** link using `https://mail.google.com/mail/?view=cm&fs=1&...` with URL-length guards.

### 8.2 v2 (high effort)

- OAuth + Gmail API in extension; restricted scopes; secure token storage.

**Exit criterion for Phase H:** v1 parity with current assist + Gmail link; v2 optional roadmap.

---

## 9. List view interaction (Phase I)

- **Do not** add a second column in the **results grid** unless explicitly scoped.
- Ensure **mutation gating** and **idempotent decoration** remain compatible with new detail observers (separate `MutationObserver` subtree scoped to `dat-load-details` if needed).

---

## 10. Testing strategy (Phase J)

### 10.1 Automated

| Layer | Tests |
|-------|--------|
| Pure functions | Geocode keys, polyline decode, RPM math, toll response mapper |
| DOM fixtures | Column insertion on **frozen** HTML snippets from corpus |
| E2E (optional) | Playwright against static HTML fixtures (not live DAT in CI) |

### 10.2 Manual QA script (abbrev)

1. Open load → column visible, map tiles load.
2. Resize window → no overlap; map resizes.
3. Change M* → miles + RPM + polyline update.
4. Get Tolls → result or clear N/A.
5. Scroll results list 2 min → no strobe.
6. Switch load tab → old map disposed.

---

## 11. Performance and cost

| Risk | Mitigation |
|------|------------|
| OSRM / tile rate limits | Cache routes; debounce; user-triggered tolls |
| Bundle size | Code-split map vendor; lazy `import()` |
| Memory | Destroy map on detail close |

---

## 12. Rollout plan (Phase K)

| Milestone | Deliverable |
|-----------|-------------|
| K0 | Feature flag `datExtNumeoColumn=false` default in storage |
| K1 | Internal build, dogfood |
| K2 | Beta users opt-in |
| K3 | Default on after stability window |

---

## 13. Work breakdown structure (WBS) — rough order

1. **A** PRD + DOM capture (1–2 weeks with reviews)
2. **D** Column host prototype **without** map (3–5 days)
3. **E** Map module (5–10 days)
4. **G** Fields + RPM logic (3–7 days)
5. **F** Tolls integration (parallel, 5–15 days depending on vendor)
6. **H** Email v1 polish (1–3 days)
7. **I/J** Regression + list stability (3–7 days)
8. **K** Rollout (ongoing)

**Order dependency:** **A → D → E → G**; **F** parallel after A; **H** anytime; **I** last before K.

---

## 14. Risks register

| ID | Risk | Likelihood | Impact | Mitigation |
|----|------|------------|--------|------------|
| R1 | DAT DOM changes break column | High | High | Feature flag; rapid corpus diff; fallback to current “Lane Intelligence” row |
| R2 | CSP blocks map tiles | Med | High | Try alternate tile host; iframe fallback |
| R3 | Legal block on automation | Low | Catastrophic | Counsel review in Phase A |
| R4 | User trust (numbers disagree) | High | Med | Transparent labels + tooltips |

---

## 15. Answer to “can we clone it?”

**Yes, in a product-engineering sense:** the reference is a **feasible class of extension UX** (column + map + inputs + tolls + mail actions) built on top of DAT’s page.

**No, in a trivial sense:** it is **not** a small fork of the current codebase; it is a **large new subsystem** (layout engine + map + tolls + state) with **higher** coupling to DAT’s DOM and **higher** operational burden (keys, tiles, compliance).

This plan is the roadmap to that clone **without** having modified any application code in the repository.
