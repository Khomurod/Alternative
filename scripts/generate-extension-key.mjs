/**
 * Generate or reuse RSA key pair; write public "key" to manifest.json.
 * Private PEM: tools/extension-private.pem (gitignored).
 */

import {
  generateKeyPairSync,
  createPublicKey,
  createPrivateKey
} from "crypto";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";
import { extensionIdFromManifestKey } from "./extension-id.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const manifestPath = join(root, "manifest.json");
const pemPath = join(root, "tools", "extension-private.pem");

function loadOrCreatePem() {
  mkdirSync(join(root, "tools"), { recursive: true });

  if (existsSync(pemPath)) {
    return readFileSync(pemPath, "utf8");
  }

  const { privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" }
  });

  writeFileSync(pemPath, privateKey, "utf8");
  console.info("[extension:key] Created", pemPath);
  return privateKey;
}

/**
 * @param {string} pemPrivate
 * @returns {string} base64 SPKI for manifest "key"
 */
function manifestKeyFromPem(pemPrivate) {
  const privateKey = createPrivateKey(pemPrivate);
  const publicKey = createPublicKey(privateKey);
  const der = publicKey.export({ type: "spki", format: "der" });
  return Buffer.from(der).toString("base64");
}

function updateManifestKey(base64Key) {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  manifest.key = base64Key;
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

const pem = loadOrCreatePem();
const base64Key = manifestKeyFromPem(pem);
updateManifestKey(base64Key);

const extensionId = extensionIdFromManifestKey(base64Key);

console.info("[extension:key] Updated manifest.json with public key");
console.info("[extension:key] Extension ID:", extensionId);
console.info(
  "[extension:key] Update Google Cloud → Credentials → Chrome extension OAuth client → Application ID to:",
  extensionId
);
