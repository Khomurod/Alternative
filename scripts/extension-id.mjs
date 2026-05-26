/**
 * Chrome extension ID from manifest "key" (SPKI DER, base64).
 * Matches Chromium crx_file::id_util::GenerateIdFromHash.
 */

import { createHash } from "crypto";
import { readFileSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const manifestPath = join(root, "manifest.json");

/**
 * @param {Buffer} derSpki
 * @returns {string}
 */
export function extensionIdFromPublicKeyDer(derSpki) {
  const hex = createHash("sha256").update(derSpki).digest("hex").slice(0, 32);
  let id = "";
  for (let i = 0; i < 32; i++) {
    id += String.fromCharCode(0x61 + parseInt(hex[i], 16));
  }
  return id;
}

/**
 * @param {string} base64Key manifest "key" field
 * @returns {string}
 */
export function extensionIdFromManifestKey(base64Key) {
  const der = Buffer.from(base64Key.replace(/\s/g, ""), "base64");
  return extensionIdFromPublicKeyDer(der);
}

/**
 * @returns {string}
 */
export function extensionIdFromManifestFile(path = manifestPath) {
  const manifest = JSON.parse(readFileSync(path, "utf8"));
  const key = manifest?.key;
  if (!key || typeof key !== "string") {
    throw new Error(`No "key" in ${path}. Run: npm run extension:key`);
  }
  return extensionIdFromManifestKey(key);
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  try {
    const id = extensionIdFromManifestFile();
    console.log(id);
  } catch (err) {
    console.error(err?.message || err);
    process.exitCode = 1;
  }
}
