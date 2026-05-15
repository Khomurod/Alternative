/**
 * Splits repo-root message.txt (DAT UI capture) into docs/dat-ui-corpus/
 * for easier review by humans and AI agents.
 *
 * Run: node scripts/split-message-txt.mjs
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const INPUT = path.join(ROOT, "message.txt");
const OUT_DIR = path.join(ROOT, "docs", "dat-ui-corpus");

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function writeFile(relPath, content) {
  const target = path.join(OUT_DIR, relPath);
  ensureDir(path.dirname(target));
  fs.writeFileSync(target, content, "utf8");
}

function readLines() {
  const raw = fs.readFileSync(INPUT, "utf8");
  return raw.split(/\r?\n/);
}

function frequencyMap(regex, text) {
  const map = new Map();
  let match;
  const r = new RegExp(regex.source, regex.flags.includes("g") ? regex.flags : `${regex.flags}g`);
  while ((match = r.exec(text)) !== null) {
    const key = match[1];
    map.set(key, (map.get(key) || 0) + 1);
  }
  return map;
}

function formatTopMap(map, limit = 80) {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([k, v]) => `- \`${k}\` — ${v}`)
    .join("\n");
}

function sliceLines(lines, start1, end1) {
  return lines.slice(start1 - 1, end1).join("\n");
}

function main() {
  if (!fs.existsSync(INPUT)) {
    console.error("Missing input:", INPUT);
    process.exit(1);
  }

  ensureDir(OUT_DIR);

  const lines = readLines();
  const fullText = fs.readFileSync(INPUT, "utf8");

  const htmlOpen = (lines[0] || "").slice(0, 500);
  const titleMatch = fullText.match(/<title>([^<]*)<\/title>/i);

  // --- Page meta (avoid nested backticks in template literals)
  const pageMeta =
    "# Page meta (from capture)\n\n" +
    "## Source\n\n" +
    "- File: `message.txt` (repo root)\n" +
    `- Generated lines: ${lines.length}\n\n` +
    "## Opening `<html>` (truncated)\n\n" +
    "```html\n" +
    htmlOpen.replace(/`/g, "'") +
    "\n...\n```\n\n" +
    "## Document title\n\n" +
    (titleMatch ? `- **${titleMatch[1].trim()}**` : "- (no title found)") +
    "\n\n" +
    "## Extension state on `<html>`\n\n" +
    "From the opening tag, this capture includes DAT Dispatcher Assist **data attributes** (toolbar layout), " +
    "e.g. `data-dat-ext-toolbar-mode`, `data-dat-ext-summary-density`, and CSS vars like `--dat-ext-toolbar-max-width`. " +
    "That proves the extension was active when the snapshot was taken.\n";
  writeFile("01-page-meta.md", pageMeta);

  // --- Giant line 192 (CSS) — head + tail only
  const L192 = lines[191] || "";
  const HEAD = 120_000;
  const TAIL = 80_000;
  writeFile(
    "02-inline-css-line192-HEAD.txt",
    L192.length > HEAD
      ? L192.slice(0, HEAD) + `\n\n/* --- TRUNCATED: ${L192.length - HEAD} chars omitted --- */\n`
      : L192
  );
  writeFile(
    "02-inline-css-line192-TAIL.txt",
    L192.length > TAIL ? `/* --- TAIL ONLY: last ${TAIL} of ${L192.length} chars --- */\n` + L192.slice(-TAIL) : L192
  );
  writeFile(
    "02-inline-css-line192-README.md",
    `# Inline CSS blob (line 192)\n\nThe original \`message.txt\` contains a **very long line 192** (~${L192.length.toLocaleString()} chars) of concatenated CSS (starts with \`#menufication-top\`). It is **not** DAT semantic markup; it bloats captures and is low priority for selector learning.\n\n## Split files\n\n- \`02-inline-css-line192-HEAD.txt\` — first ~${HEAD.toLocaleString()} chars\n- \`02-inline-css-line192-TAIL.txt\` — last ~${TAIL.toLocaleString()} chars\n\nFor the untouched full line, open \`message.txt\` and go to **line 192**.\n`
  );

  // --- Head lines 2–191 (skip line 192)
  writeFile(
    "03-head-lines-002-191.html",
    sliceLines(lines, 2, 191) + "\n"
  );

  // --- Body in line-range chunks (skip 192 from “body” narrative; body tag is ~196)
  const bodyRanges = [
    [196, 250, "04-body-lines-196-250.html"],
    [251, 320, "05-body-lines-251-320.html"],
    [321, 420, "06-body-lines-321-420.html"],
    [421, 520, "07-body-lines-421-520.html"],
    [521, 620, "08-body-lines-521-620.html"],
    [621, lines.length, "09-body-lines-621-END.html"]
  ];

  for (const [a, b, name] of bodyRanges) {
    writeFile(name, sliceLines(lines, a, b) + "\n");
  }

  // --- Selector inventories (full file)
  const dataTests = frequencyMap(/data-test="([^"]+)"/g, fullText);
  const datTags = frequencyMap(/<(dat-[a-z0-9-]+)/gi, fullText);
  const cgTags = frequencyMap(/<(cg-[a-z0-9-]+)/gi, fullText);

  writeFile(
    "10-selectors-data-test.md",
    `# data-test inventory\n\nUnique values: **${dataTests.size}**. Top by frequency:\n\n${formatTopMap(dataTests, 120)}\n`
  );

  writeFile(
    "11-custom-elements-dat.md",
    `# \`dat-*\` custom elements (opening tags)\n\nUnique tags: **${datTags.size}**. Top by frequency:\n\n${formatTopMap(datTags, 120)}\n`
  );

  writeFile(
    "12-custom-elements-cg.md",
    `# \`cg-*\` custom elements (opening tags)\n\nUnique tags: **${cgTags.size}**. Top by frequency:\n\n${formatTopMap(cgTags, 80)}\n`
  );

  const extHits = {
    "dat-ext-": (fullText.match(/dat-ext-/g) || []).length,
    "my-ext-": (fullText.match(/my-ext-/g) || []).length,
    "dat-ext-grid-row": (fullText.match(/dat-ext-grid-row/g) || []).length,
    "my-ext-global-tools": (fullText.match(/my-ext-global-tools/g) || []).length
  };

  const idxTools = fullText.indexOf("my-ext-global-tools");
  const idxViewport = fullText.indexOf('id="table-viewport"');
  const snippet = (label, index, radius = 2500) => {
    if (index < 0) {
      return `## ${label}\n\n(not found)\n`;
    }
    const start = Math.max(0, index - radius);
    const end = Math.min(fullText.length, index + radius);
    const chunk = fullText.slice(start, end);
    return `## ${label}\n\nIndex **${index}** (±${radius} chars). Context:\n\n\`\`\`html\n${chunk.replace(/```/g, "\\`\\`\\`")}\n\`\`\`\n`;
  };

  writeFile(
    "13-extension-footprint.md",
    `# Extension footprint in this capture\n\nRough counts in full \`message.txt\`:\n\n${Object.entries(extHits)
      .map(([k, v]) => `- **${k}**: ${v}`)
      .join("\n")}\n\n${snippet("Around my-ext-global-tools", idxTools)}\n\n${snippet('Around id="table-viewport"', idxViewport)}\n`
  );

  const readme =
    "# DAT UI capture corpus\n\n" +
    "This folder splits **`message.txt`** (full DOM capture from DAT One in Chrome) into smaller files " +
    "so agents can load **only the slice they need**.\n\n" +
    "## Start here\n\n" +
    "| Order | File | Purpose |\n| --- | --- | --- |\n" +
    "| 0 | `TASK_PLAN.md` | Agent checklist: what to read and in what order |\n" +
    "| 0 | `IMPLEMENTATION_PLAN.md` | Phased plan to align the extension with this DOM |\n" +
    "| 1 | `01-page-meta.md` | Title, `<html>` attrs, extension state on root |\n" +
    "| 2 | `02-inline-css-line192-README.md` | Explains the megabyte CSS line |\n" +
    "| 3 | `03-head-lines-002-191.html` | Early head material (fonts, meta, smaller styles) |\n" +
    "| 4–9 | `04-body-…` through `09-body-…` | Body HTML in line ranges (includes virtual scroll + rows) |\n" +
    "| 10–12 | `10-selectors-*`, `11-*`, `12-*` | Inventories: `data-test`, `dat-*`, `cg-*` |\n" +
    "| 13 | `13-extension-footprint.md` | Counts + snippets around toolbar and table viewport |\n\n" +
    "## Canonical full capture\n\n" +
    "- **`../../message.txt`** — unchanged original (includes full line 192).\n\n" +
    "## Regenerating\n\n" +
    "From repo root:\n\n" +
    "```bash\nnode scripts/split-message-txt.mjs\n```\n\n" +
    "Or: `npm run split:dat-ui` (see `package.json`).\n";
  writeFile("README.md", readme);

  console.log("Wrote corpus to", OUT_DIR);
}

main();
