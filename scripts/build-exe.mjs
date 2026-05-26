/**
 * Stage extension → dist/extension, then compile Windows installer (.exe) and/or release zip.
 * Does not modify src/ or overwrite repo-root content.js/popup.js.
 *
 * Prerequisites (exe only): NSIS 3.x — `makensis.exe` on PATH, or set env `MAKENSIS_PATH`
 *
 * Flags:
 *   --stage-only — build dist/extension only
 *   --zip        — stage + README-INSTALL.md + DAT-Dispatcher-Assist-<version>.zip (no NSIS)
 *   (default)    — stage + INSTALL.html + DAT-Dispatcher-Assist-Setup.exe
 */

import { readFileSync, writeFileSync, rmSync, mkdirSync, cpSync, existsSync } from "fs";
import { execSync } from "child_process";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";
import { buildSync } from "esbuild";
import { compile } from "makensis";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const staging = join(root, "dist", "extension");
const manifestPath = join(root, "manifest.json");
const exeName = "DAT-Dispatcher-Assist-Setup.exe";
const zipFolderName = "DAT-Dispatcher-Assist";

const stageOnly = process.argv.includes("--stage-only");
const buildZip = process.argv.includes("--zip");

function logPrefix() {
  return buildZip ? "[dist:zip]" : "[dist:exe]";
}

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
    entryPoints: [join(root, "src/sidepanel-entry.js")],
    outfile: join(staging, "sidepanel.js")
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
    "sidepanel.html",
    "cities.json"
  ];
  for (const f of files) {
    cpSync(join(root, f), join(staging, f));
  }

  const imagesDir = join(root, "leaflet-images");
  if (existsDir(imagesDir)) {
    cpSync(imagesDir, join(staging, "leaflet-images"), { recursive: true });
  }
}

function existsDir(path) {
  return existsSync(path);
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

/**
 * @param {string} version
 */
function writeInstallReadme(version) {
  const md = `# DAT Dispatcher Assist — Install and use

Version **${version}** (Chrome extension, not from the Web Store).

**Recommended install:** use this ZIP and **Load unpacked** in Chrome. Some antivirus tools falsely flag the optional \`Setup.exe\` installer.

---

## 1. Extract the ZIP

1. Extract this entire folder to a **permanent** location, for example:
   - \`Documents\\DAT-Dispatcher-Assist\`
2. Keep the folder on disk while you use the extension (do not delete it after installing).
3. The folder you select in Chrome must contain \`manifest.json\` (this folder).

---

## 2. Load the extension in Chrome

1. Open **Google Chrome**.
2. Go to \`chrome://extensions\`
3. Turn on **Developer mode** (top-right).
4. Click **Load unpacked**.
5. Select this folder (the one containing \`manifest.json\`).
6. Confirm **DAT Dispatcher Assist Tool** appears and is **enabled**.

---

## 3. Open settings (Side Panel)

1. Click the extension icon in Chrome (or open the **Side Panel** for this extension).
2. Optional: **Sign in with Google** if you want **Send email** from DAT (Gmail API). You can still use **Open … in Gmail** without signing in.
3. Under **Email templates**, set your offer/booking text. Use the placeholder buttons (**Pick up location**, **Delivery location**, etc.) to insert \`{{origin}}\`, \`{{destination}}\`, \`{{company}}\`, \`{{email}}\`.
4. Leave **Include load summary above email body** **unchecked** if you want the email body to be **only** your template text (recommended).
5. Click **Save templates & options**.

---

## 4. Use on DAT

1. Open [DAT](https://www.dat.com/) and sign in as usual.
2. Expand a load row to see the assist column (route, tolls, email actions).
3. Click **Send Offer Email** or **Send Booking Email** to open the Gmail panel on the page.
4. The **Currently sends** preview in the side panel shows sample data; the real load uses actual pickup/delivery from DAT.

---

## 5. Updates

1. Download a newer ZIP build.
2. Replace this folder (or extract the new ZIP to a new folder).
3. In \`chrome://extensions\`, click **Reload** on DAT Dispatcher Assist Tool.
4. Reload your DAT tabs.

---

## Google sign-in (Gmail from DAT)

This build uses a **fixed extension ID** (same on every PC when you Load unpacked from this folder).

1. After installing, open \`chrome://extensions\` and note the extension **ID** (32 letters).
2. **Sign in with Google** in the extension Side Panel.
3. If you see \`bad client id\`, your administrator must set the Google Cloud OAuth client (type **Chrome extension**) **Application ID** to match that extension ID. End users cannot fix this in Chrome.
4. The Gmail API must be enabled on the same Google Cloud project as the OAuth client.

---

## Optional: TollGuru

Add your TollGuru API key in the side panel if you want truck toll estimates in the assist column.

---

## Antivirus note

If \`DAT-Dispatcher-Assist-Setup.exe\` was blocked or flagged, **use this ZIP method instead**. It only copies plain extension files; there is no installer program.
`;
  writeFileSync(join(staging, "README-INSTALL.md"), md, "utf8");
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

/**
 * @param {string} version
 * @returns {string} Absolute path to created zip
 */
function createReleaseZip(version) {
  const zipFileName = `DAT-Dispatcher-Assist-${version}.zip`;
  const zipPath = join(root, zipFileName);
  const payloadRoot = join(root, "dist", "zip-payload");
  const payloadDir = join(payloadRoot, zipFolderName);

  rmSync(payloadRoot, { recursive: true, force: true });
  mkdirSync(payloadDir, { recursive: true });
  cpSync(staging, payloadDir, { recursive: true });

  if (existsSync(zipPath)) {
    rmSync(zipPath, { force: true });
  }

  if (process.platform === "win32") {
    const src = payloadDir.replace(/'/g, "''");
    const dest = zipPath.replace(/'/g, "''");
    execSync(
      `powershell -NoProfile -Command "Compress-Archive -LiteralPath '${src}' -DestinationPath '${dest}' -Force"`,
      { stdio: "inherit" }
    );
  } else {
    console.warn(
      `${logPrefix()} Automatic zip requires Windows PowerShell. Manually zip this folder:`,
      payloadDir
    );
    return payloadDir;
  }

  return zipPath;
}

function stageExtension() {
  cleanStaging();
  bundleExtension();
  copyStatics();
}

async function buildExeInstaller(version, viQuad) {
  writeInstallHtml();

  const srcDirAbs = staging.replace(/\\/g, "/");
  const outFileAbs = join(root, exeName).replace(/\\/g, "/");
  const nsi = join(root, "installer", "dat-dispatcher-assist.nsi");

  if (!existsSync(nsi)) {
    console.error("Missing NSIS script:", nsi);
    process.exitCode = 1;
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
    console.info(`${logPrefix()} Using NSIS compiler:`, makensisExe);
  }

  console.info(`${logPrefix()} Compiling installer with NSIS →`, exeName);

  let result;
  try {
    result = await compile(resolve(nsi), compilerOpts);
  } catch (err) {
    console.error(`${logPrefix()} Could not run NSIS compiler:`, err?.message ?? err);
    console.error(
      `${logPrefix()} Install NSIS 3.x or set MAKENSIS_PATH. Staged extension:`,
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
      `${logPrefix()} NSIS compiler failed (status ${result.status}). Staged extension:`,
      staging
    );
    process.exitCode = 1;
    return;
  }

  console.info(`${logPrefix()} Installer:`, outFileAbs);
}

async function main() {
  const manifest = readJson(manifestPath);
  const version = String(manifest.version || "0.0.0").trim();
  const viQuad = viProductQuad(version);
  const prefix = logPrefix();

  console.info(`${prefix} Staging extension…`);
  stageExtension();

  if (stageOnly) {
    console.info(`${prefix} Done (--stage-only). Extension:`, staging);
    return;
  }

  if (buildZip) {
    writeInstallReadme(version);
    const zipOut = createReleaseZip(version);
    console.info(`${prefix} Done. Extension:`, staging);
    console.info(`${prefix} Release zip:`, zipOut);
    return;
  }

  await buildExeInstaller(version, viQuad);
  console.info(`${prefix} Done. Extension:`, staging);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
