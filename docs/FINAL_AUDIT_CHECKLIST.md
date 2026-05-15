# Final audit checklist — before merge or store upload

Run after `npm run build` and loading the **unpacked** extension in Chrome.

## 0. Build artifacts

- [ ] From repo root: `npm run build` (updates `content.js` and `popup.js`)  
- [ ] Reload unpacked extension after build  

## 0b. Popup templates

- [ ] Click extension icon → popup opens  
- [ ] Enter offer/booking body with `{{origin}}` etc., Save  
- [ ] Open a load on DAT → Offer / Booking mailto should use saved text (verify in mail client draft)  

## 1. Install / load

- [ ] `chrome://extensions` → Developer mode → Load unpacked → repo folder  
- [ ] Version matches `manifest.json`  
- [ ] No errors on extension row  

## 2. DAT page — list behavior

- [ ] Navigate to load search with visible results  
- [ ] Confirm toolbar strip is **below** Origin/Destination (not covering inputs)  
- [ ] Rapid vertical scroll for 10–15s: **no continuous full-frame flicker** (minor repaints OK)  
- [ ] Change Target Rate / RPM: summary numbers change; row highlights update within ~1s  
- [ ] Toggle “Only show matches”: rows hide/show without breaking scroll  

## 3. DAT page — detail

- [ ] Open a load with posted rate + trip miles  
- [ ] Lane Intelligence shows **Posted Rate**, **DAT Trip**, **Estimated Road Miles** after load  
- [ ] **Calculated RPM** ≈ posted rate ÷ estimated road miles (not broker `*/mi` when road miles differ materially)  
- [ ] “Open Route Map” opens OSM (or equivalent) in new tab when URL present  
- [ ] Email buttons disabled when no email; otherwise open mail client  

## 4. Network / permissions

- [ ] First route lookup: background may call Photon/OSRM/Nominatim (see `background.js` allowlist)  
- [ ] Air-gapped / blocked APIs: panel shows unavailable route, no uncaught errors in console  

## 5. Automated tests (CI parity)

```bash
npm test
npm run build
```

- [ ] All Vitest files pass  
- [ ] `content.js` generated without esbuild errors  

## 6. Regression notes

If DAT updates Angular/CDK:

- [ ] Re-export `message.txt` → `npm run split:dat-ui`  
- [ ] Diff `docs/dat-ui-corpus/10-selectors-data-test.md` for selector churn  
- [ ] Re-run sections 2–3 above  
