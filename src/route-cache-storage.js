/** chrome.storage.local + memory route cache (v5); optional migrate from localStorage v4. */

export const ROUTE_CACHE_LEGACY_LS_PREFIX = "dat-ext-route-cache-v4:";
export const ROUTE_CACHE_CHROME_PREFIX = "dat-ext-route-cache-v5:";
export const ROUTE_CACHE_MIGRATION_FLAG = "dat-ext-route-cache-migrated-v4-v5";
export const ROUTE_CACHE_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

/** @type {Map<string, object>} */
const memoryLaneByKey = new Map();

/** @type {Map<string, object>} */
const pendingChromeWrites = new Map();
let chromeFlushTimer = null;

/** @type {Promise<void> | null} */
let migrationPromise = null;

/**
 * @param {object | null | undefined} envelope
 */
function cacheEnvelopeStale(envelope) {
  const ageMs = Date.now() - Date.parse(envelope?.updatedAt || "");
  return !Number.isFinite(ageMs) || ageMs > ROUTE_CACHE_MAX_AGE_MS;
}

/**
 * @param {object} envelope
 * @returns {object}
 */
function stripUpdatedAt(envelope) {
  if (!envelope || typeof envelope !== "object") {
    return envelope;
  }
  const { updatedAt: _updatedAt, ...rest } = envelope;
  return rest;
}

/**
 * @param {string} laneKey
 */
function chromeKey(laneKey) {
  return `${ROUTE_CACHE_CHROME_PREFIX}${laneKey}`;
}

/**
 * @param {chrome.storage.StorageArea | null | undefined} area
 */
function storageGet(area, keys) {
  return new Promise((resolve) => {
    if (!area?.get) {
      resolve({});
      return;
    }
    area.get(keys, (result) => {
      resolve(result ?? {});
    });
  });
}

/**
 * @param {chrome.storage.StorageArea | null | undefined} area
 * @param {Record<string, unknown>} items
 */
function storageSet(area, items) {
  return new Promise((resolve, reject) => {
    if (!area?.set) {
      resolve();
      return;
    }
    try {
      area.set(items, () => {
        const err = typeof chrome !== "undefined" ? chrome.runtime?.lastError : undefined;
        if (err) {
          reject(new Error(err.message || "chrome.storage.local.set failed"));
          return;
        }
        resolve();
      });
    } catch (error) {
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });
}

/**
 * @param {chrome.storage.StorageArea | null | undefined} area
 * @param {string[]} keys
 */
function storageRemove(area, keys) {
  return new Promise((resolve) => {
    if (!area?.remove || keys.length === 0) {
      resolve();
      return;
    }
    area.remove(keys, () => resolve());
  });
}

/**
 * @param {Storage | null | undefined} ls
 */
function listLegacyV4Keys(ls) {
  if (!ls?.length) {
    return [];
  }
  const out = [];
  for (let i = 0; i < ls.length; i++) {
    const k = ls.key(i);
    if (k?.startsWith(ROUTE_CACHE_LEGACY_LS_PREFIX)) {
      out.push(k);
    }
  }
  return out;
}

/**
 * One-shot migration of lane entries from page localStorage into extension storage.
 *
 * @param {Storage | null | undefined} ls
 * @param {chrome.storage.StorageArea | null | undefined} area
 */
async function ensureMigratedFromLocalStorageV4(ls, area) {
  if (!area?.get || !area?.set || !ls) {
    return;
  }
  const flag = await storageGet(area, [ROUTE_CACHE_MIGRATION_FLAG]);
  if (flag[ROUTE_CACHE_MIGRATION_FLAG]) {
    return;
  }

  const legacyKeys = listLegacyV4Keys(ls);
  const batch = { [ROUTE_CACHE_MIGRATION_FLAG]: true };
  for (const lk of legacyKeys) {
    try {
      const raw = ls.getItem(lk);
      if (!raw) {
        ls.removeItem(lk);
        continue;
      }
      const parsed = JSON.parse(raw);
      if (!cacheEnvelopeStale(parsed)) {
        const suffix = lk.slice(ROUTE_CACHE_LEGACY_LS_PREFIX.length);
        batch[`${ROUTE_CACHE_CHROME_PREFIX}${suffix}`] = parsed;
      }
    } catch {
      /* discard corrupt */
    }
    try {
      ls.removeItem(lk);
    } catch {
      /* ignore */
    }
  }
  await storageSet(area, batch);
}

/**
 * @param {Storage | null | undefined} ls
 * @param {chrome.storage.StorageArea | null | undefined} area
 */
function scheduleMigration(ls, area) {
  if (!migrationPromise) {
    migrationPromise = ensureMigratedFromLocalStorageV4(ls, area).catch(() => {
      migrationPromise = null;
    });
  }
  return migrationPromise;
}

/**
 * @param {chrome.storage.StorageArea | null | undefined} area
 */
function flushPendingChrome(area) {
  if (!pendingChromeWrites.size || !area?.set) {
    return Promise.resolve();
  }
  const batch = /** @type {Record<string, object>} */ (Object.fromEntries(pendingChromeWrites));
  pendingChromeWrites.clear();
  return storageSet(area, batch);
}

/**
 * @param {chrome.storage.StorageArea | null | undefined} area
 */
export function flushRouteCacheWrites(area) {
  return flushPendingChrome(area);
}

/**
 * @param {{
 *   laneKey: string,
 *   chromeStorage?: chrome.storage.StorageArea | null,
 *   localStorage?: Storage | null,
 *   forceRefresh?: boolean
 * }} opts
 */
export async function readRouteCacheEntry(opts) {
  const { laneKey, chromeStorage, localStorage: ls, forceRefresh } = opts;
  if (!laneKey || forceRefresh) {
    return null;
  }

  const key = chromeKey(laneKey);

  const memHit = memoryLaneByKey.get(key);
  if (memHit && !cacheEnvelopeStale(memHit)) {
    return stripUpdatedAt(memHit);
  }
  if (memHit && cacheEnvelopeStale(memHit)) {
    memoryLaneByKey.delete(key);
  }

  if (chromeStorage?.get) {
    await scheduleMigration(ls, chromeStorage);
    const blob = await storageGet(chromeStorage, [key]);
    const envelope = blob?.[key];
    if (envelope && typeof envelope === "object" && envelope.updatedAt) {
      if (!cacheEnvelopeStale(envelope)) {
        memoryLaneByKey.set(key, envelope);
        return stripUpdatedAt(envelope);
      }
      await storageRemove(chromeStorage, [key]);
    }
  }

  // Cold path: stray v4 on page origin (migrate may have skipped if extension storage empty at boot).
  if (ls?.getItem) {
    try {
      const raw = ls.getItem(`${ROUTE_CACHE_LEGACY_LS_PREFIX}${laneKey}`);
      if (!raw) {
        return null;
      }
      const envelope = JSON.parse(raw);
      if (cacheEnvelopeStale(envelope)) {
        ls.removeItem(`${ROUTE_CACHE_LEGACY_LS_PREFIX}${laneKey}`);
        return null;
      }
      memoryLaneByKey.set(key, envelope);

      pendingChromeWrites.set(key, envelope);
      chromeFlushTimer ??= /** @type {ReturnType<typeof setTimeout>} */ (
        globalThis.setTimeout(() => {
          chromeFlushTimer = null;
          void flushPendingChrome(chromeStorage);
        }, 50)
      );
      try {
        ls.removeItem(`${ROUTE_CACHE_LEGACY_LS_PREFIX}${laneKey}`);
      } catch {
        /* ignore */
      }

      return stripUpdatedAt(envelope);
    } catch {
      try {
        ls.removeItem(`${ROUTE_CACHE_LEGACY_LS_PREFIX}${laneKey}`);
      } catch {
        /* ignore */
      }
    }
  }

  return null;
}

/**
 * @param {{
 *   laneKey: string,
 *   payload: object,
 *   chromeStorage?: chrome.storage.StorageArea | null,
 *   localStorage?: Storage | null
 * }} opts
 */
export async function writeRouteCacheEntry(opts) {
  const { laneKey, payload, chromeStorage, localStorage: ls } = opts;
  if (!laneKey || !payload) {
    return;
  }

  const key = chromeKey(laneKey);
  const envelope = {
    ...payload,
    updatedAt: new Date().toISOString()
  };
  memoryLaneByKey.set(key, envelope);

  try {
    ls?.removeItem?.(`${ROUTE_CACHE_LEGACY_LS_PREFIX}${laneKey}`);
  } catch {
    /* ignore */
  }

  if (!chromeStorage?.set) {
    try {
      ls?.setItem?.(key, JSON.stringify(envelope));
    } catch {
      /* ignore quota */
    }
    return;
  }

  pendingChromeWrites.set(key, envelope);
  if (chromeFlushTimer) {
    return;
  }

  chromeFlushTimer = /** @type {ReturnType<typeof setTimeout>} */ (
    globalThis.setTimeout(async () => {
      chromeFlushTimer = null;
      try {
        await flushPendingChrome(chromeStorage);
      } catch {
        /* ignore bursts */
      }
    }, 50)
  );
}
