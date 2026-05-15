# Extension task plan — execution checklist

Use this for PRs, releases, and agent handoffs. Mark items when done.

## A. Engineering tasks (this iteration)

- [x] Extract mutation filter to `src/mutation-gating.js` with tests  
- [x] Gate CDK wrapper `style` mutations and row `class` noise  
- [x] Handle `removedNodes` in mutation gating  
- [x] Add `src/row-deco-key.js` + tests; wire into `grid.js` and `dat-one-virtual.js`  
- [x] Idempotent row decoration (`datExtDecoKey`)  
- [x] Detail panel render cache (`datExtRenderKey`) + clear on signature change  
- [x] `resolveDetailPanelRpm` + parser tests  
- [x] Extension popup + `chrome.storage` for offer/booking email templates (`popup.html`, `popup.js`)  
- [x] `npm run build` builds **both** `content.js` and `popup.js`  
- [x] `npm test` all green  

## B. Manual QA on `*.dat.com` (required each release)

See `docs/FINAL_AUDIT_CHECKLIST.md` for the full pass.

Minimum smoke:

- [ ] Search Loads / Leads: results appear, toolbar visible below native filters  
- [ ] Scroll fast through 200+ rows: list should not strobe/flicker excessively  
- [ ] Change targets: row colors and summary update  
- [ ] “Only show matches”: non-pass rows hide/show  
- [ ] Expand load: Lane Intelligence panel appears; RPM updates after route line settles  
- [ ] Click extension icon: popup opens; save a template; reopen DAT detail and verify mail body  
- [ ] Mail buttons: open client or prompt when email present  

## C. Follow-up backlog (prioritize separately)

- [ ] Optional: Gmail compose deep link (no OAuth) with length limits  
- [ ] Optional: multi-leg RPM (spec + rate limits)  
- [ ] Optional: subtree-scoped `MutationObserver`  
- [ ] Optional: Gmail OAuth + `chrome.identity` (restricted scopes, store disclosure)  

## D. Documentation

- [x] `EXTENSION_IMPLEMENTATION_PLAN.md` (this folder)  
- [x] `EXTENSION_TASK_PLAN.md`  
- [x] `FINAL_AUDIT_CHECKLIST.md`  
