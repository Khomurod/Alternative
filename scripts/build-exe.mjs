/**
 * Stage extension → dist/extension, then compile Windows installer (.exe).
 * Does not modify src/ or overwrite repo-root content.js/popup.js.
 *
 * Prerequisites: NSIS 3.x — `makensis.exe` on PATH, or set env `MAKENSIS_PATH`
 * to its full path. Common default: `%ProgramFiles(x86)%\\NSIS\\makensis.exe`
 *
 * Flags:
 *   --stage-only — build dist/extension only, skip compiling the installer
 */

import { readFileSync, writeFileSync, rmSync, mkdirSync, cpSync, existsSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";
import { buildSync } from "esbuild";
import { compile } from "makensis";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const staging = join(root, "dist", "extension");
const manifestPath = join(root, "manifest.json");
const exeName = "DAT-Dispatcher-Assist-Setup.exe";

const stageOnly = process.argv.includes("--stage-only");

function findMakensisPath() {
  const envPath = process.env.MAKENSIS_PATH?.trim();
  if (envPath && existsSync(envPath)) {
    return envPath;
  }

  const programFiles86 = process.env["ProgramFiles(x86)"] ?? "";
  const programFiles64 = process.env.ProgramFiles ?? "";
  const portable = join(root, "tools", "nsis-portable", "nsis-3.12", "makensis.exe");
  const candidates = [
    join(programFiles86, "NSIS", "makensis.exe"),
    join(programFiles64, "NSIS", "makensis.exe"),
    portable
  ];
  for (const candidate of candidates) {
    if (candidate && existsSync(candidate)) {
      return candidate;
    }
  }
  return "";
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function cleanStaging() {
  rmSync(join(root, "dist"), { recursive: true, force: true });
  mkdirSync(staging, { recursive: true });
}

function bundleExtension() {
  const common = {
    bundle: true,
    platform: "browser",
    target: "chrome114",
    legalComments: "none"
  };

  buildSync({
    ...common,
    entryPoints: [join(root, "src/content-entry.js")],
    outfile: join(staging, "content.js")
  });

  buildSync({
    ...common,
    entryPoints: [join(root, "src/popup-entry.js")],
    outfile: join(staging, "popup.js")
  });

  buildSync({
    ...common,
    entryPoints: [join(root, "background.js")],
    outfile: join(staging, "background.js"),
    format: "esm"
  });
}

function copyStatics() {
  const files = [
    "manifest.json",
    "styles.css",
    "leaflet-vendor.css",
    "popup.html",
    "cities.json"
  ];
  for (const f of files) {
    cpSync(join(root, f), join(staging, f));
  }

  const imagesDir = join(root, "leaflet-images");
  if (existsSync(imagesDir)) {
    cpSync(imagesDir, join(staging, "leaflet-images"), { recursive: true });
  }
}

function writeInstallHtml() {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>DAT Dispatcher Assist — Finish setup</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 42rem; margin: 2rem auto; padding: 0 1rem; color: #111827; line-height: 1.5; }
    code { background: #f3f4f6; padding: 0.15rem 0.4rem; border-radius: 4px; }
    ol { padding-left: 1.25rem; }
    h1 { font-size: 1.25rem; }
  </style>
</head>
<body>
  <h1>DAT Dispatcher Assist — Chrome setup</h1>
  <p>The extension files were installed to:</p>
  <p><code>%LOCALAPPDATA%\\DAT_Dispatcher_Assist</code></p>
  <p>Chrome should have opened to <code>chrome://extensions</code>. If not, open that address in Google Chrome.</p>
  <ol>
    <li>Turn on <strong>Developer mode</strong> (top right on the Extensions page).</li>
    <li>Click <strong>Load unpacked</strong>.</li>
    <li>Select the folder above (paste <code>%LOCALAPPDATA%\\DAT_Dispatcher_Assist</code> into the folder picker address bar, or browse to your user <code>AppData\\Local\\DAT_Dispatcher_Assist</code>).</li>
    <li>Confirm the extension &quot;DAT Dispatcher Assist Tool&quot; appears and is enabled.</li>
  </ol>
  <p>Then use <a href="https://www.dat.com/" rel="noopener">DAT</a> as usual. This build is not from the Chrome Web Store; keep this folder on disk while you use the extension.</p>
</body>
</html>
`;
  writeFileSync(join(staging, "INSTALL.html"), html, "utf8");
}

function viProductQuad(versionLabel) {
  const parts = String(versionLabel || "0")
    .split(/[^0-9]+/)
    .filter((p) => p.length > 0)
    .map((p) => Math.min(Number.parseInt(p, 10) || 0, 65535))
    .slice(0, 4);
  while (parts.length < 4) {
    parts.push(0);
  }
  return parts.join(".");
}

async function main() {
  const manifest = readJson(manifestPath);
  const version = String(manifest.version || "0.0.0").trim();
  const viQuad = viProductQuad(version);

  console.info("[dist:exe] Staging extension…");
  cleanStaging();
  bundleExtension();
  copyStatics();
  writeInstallHtml();

  const srcDirAbs = staging.replace(/\\/g, "/");
  const outFileAbs = join(root, exeName).replace(/\\/g, "/");
  const nsi = join(root, "installer", "dat-dispatcher-assist.nsi");

  if (!existsSync(nsi)) {
    console.error("Missing NSIS script:", nsi);
    process.exitCode = 1;
    return;
  }

  if (stageOnly) {
    console.info("[dist:exe] Done (--stage-only). Extension:", staging);
    return;
  }

  const makensisExe = findMakensisPath();
  const compilerOpts = {
    verbose: 1,
    define: {
      SRC_DIR_ABS: srcDirAbs,
      OUTFILE_PATH: outFileAbs,
      PRODUCT_VERSION: version,
      VI_PRODUCT_QUAD: viQuad
    }
  };
  if (makensisExe) {
    compilerOpts.pathToMakensis = makensisExe;
    console.info("[dist:exe] Using NSIS compiler:", makensisExe);
  }

  console.info("[dist:exe] Compiling installer with NSIS →", exeName);

  let result;
  try {
    result = await compile(resolve(nsi), compilerOpts);
  } catch (err) {
    console.error("[dist:exe] Could not run NSIS compiler:", err?.message ?? err);
    console.error(
      "[dist:exe] Install NSIS 3.x from https://nsis.sourceforge.io/ (default path Program Files (x86)\\NSIS),\n[dist:exe] add makensis.exe to PATH, or set MAKENSIS_PATH to the full path of makensis.exe.\n[dist:exe] Staged extension is ready at:",
      staging
    );
    process.exitCode = 1;
    return;
  }

  if (result.stderr) {
    console.error(result.stderr);
  }
  console.info(result.stdout || "");

  if (result.status !== 0) {
    console.error(
      "[dist:exe] NSIS compiler failed (status " +
        result.status +
        "). Install NSIS 3.x or set MAKENSIS_PATH.\n[dist:exe] Staged extension:",
      staging
    );
    process.exitCode = 1;
    return;
  }

  console.info("[dist:exe] Done. Extension:", staging);
  console.info("[dist:exe] Installer:", outFileAbs);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
