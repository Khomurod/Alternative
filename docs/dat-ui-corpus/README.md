# DAT UI capture corpus

This folder splits **`message.txt`** (full DOM capture from DAT One in Chrome) into smaller files so agents can load **only the slice they need**.

## Start here

| Order | File | Purpose |
| --- | --- | --- |
| 0 | `TASK_PLAN.md` | Agent checklist: what to read and in what order |
| 0 | `IMPLEMENTATION_PLAN.md` | Phased plan to align the extension with this DOM |
| 1 | `01-page-meta.md` | Title, `<html>` attrs, extension state on root |
| 2 | `02-inline-css-line192-README.md` | Explains the megabyte CSS line |
| 3 | `03-head-lines-002-191.html` | Early head material (fonts, meta, smaller styles) |
| 4–9 | `04-body-…` through `09-body-…` | Body HTML in line ranges (includes virtual scroll + rows) |
| 10–12 | `10-selectors-*`, `11-*`, `12-*` | Inventories: `data-test`, `dat-*`, `cg-*` |
| 13 | `13-extension-footprint.md` | Counts + snippets around toolbar and table viewport |

## Canonical full capture

- **`../../message.txt`** — unchanged original (includes full line 192).

## Regenerating

From repo root:

```bash
node scripts/split-message-txt.mjs
```

Or: `npm run split:dat-ui` (see `package.json`).
