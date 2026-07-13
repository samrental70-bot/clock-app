// On-device photo cache for the Photos/Receipts grid.
//
// A PWA can't write into the phone's native gallery folder, so this is the
// closest equivalent: an app-private IndexedDB store that keeps a copy of each
// image (a small thumbnail for the grid + the full image for the viewer) so
// reopening Photos is instant and works offline. Controlled by a Settings
// toggle (on by default).

const DB_NAME = "opera-photo-cache";
const DB_VERSION = 1;
const STORE = "images";
const SETTING_KEY = "opera.photoLocalCacheEnabled";
const THUMB_MAX = 240; // px, longest edge for grid thumbnails
const THUMB_QUALITY = 0.5;

/** Whether the on-device photo cache is enabled (default: on). */
export function isPhotoCacheEnabled() {
  if (typeof window === "undefined") return false;
  try {
    const raw = window.localStorage?.getItem(SETTING_KEY);
    return raw === null || raw === undefined ? true : raw === "1";
  } catch {
    return true;
  }
}

export function setPhotoCacheEnabled(enabled) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage?.setItem(SETTING_KEY, enabled ? "1" : "0");
  } catch {
    /* ignore */
  }
}

let dbPromise = null;

function openDb() {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    let request;
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      resolve(null);
      return;
    }
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "url" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
  return dbPromise;
}

function idbGet(db, url) {
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(url);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

function idbPut(db, record) {
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(record);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
      tx.onabort = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

/** Build a small thumbnail Blob from a full-image Blob using canvas. Falls back to the original blob on any failure. */
async function makeThumbnailBlob(fullBlob) {
  if (typeof document === "undefined") return fullBlob;
  let bitmap = null;
  try {
    if (typeof createImageBitmap === "function") {
      bitmap = await createImageBitmap(fullBlob);
    }
  } catch {
    bitmap = null;
  }
  try {
    const width = bitmap ? bitmap.width : 0;
    const height = bitmap ? bitmap.height : 0;
    if (!bitmap || !width || !height) return fullBlob;
    const scale = Math.min(1, THUMB_MAX / Math.max(width, height));
    // Already small enough — no point re-encoding.
    if (scale >= 1) {
      bitmap.close?.();
      return fullBlob;
    }
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return fullBlob;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    const thumb = await new Promise((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/jpeg", THUMB_QUALITY)
    );
    return thumb || fullBlob;
  } catch {
    bitmap?.close?.();
    return fullBlob;
  }
}

/**
 * Return a cached object URL for `url`, or null if not cached.
 * variant: "thumb" (grid) or "full" (viewer). Falls back across variants.
 * Caller owns the returned object URL and must revoke it.
 */
export async function getCachedObjectUrl(url, variant = "thumb") {
  if (!url) return null;
  const db = await openDb();
  if (!db) return null;
  const record = await idbGet(db, url);
  if (!record) return null;
  const blob =
    variant === "full"
      ? record.full || record.thumb
      : record.thumb || record.full;
  if (!blob) return null;
  try {
    return URL.createObjectURL(blob);
  } catch {
    return null;
  }
}

/**
 * Fetch `url`, store the full image + a generated thumbnail, and return object
 * URLs for the requested variant. Returns null on any network/storage failure
 * so the caller can fall back to the original network URL.
 */
export async function fetchAndCacheImage(url, variant = "thumb") {
  if (!url || typeof fetch === "undefined") return null;
  let fullBlob;
  try {
    const res = await fetch(url, { mode: "cors", credentials: "omit" });
    if (!res.ok) return null;
    fullBlob = await res.blob();
  } catch {
    return null;
  }
  if (!fullBlob || fullBlob.size === 0) return null;
  const thumbBlob = await makeThumbnailBlob(fullBlob);
  const db = await openDb();
  if (db) {
    await idbPut(db, { url, full: fullBlob, thumb: thumbBlob, cachedAt: Date.now() });
  }
  const chosen = variant === "full" ? fullBlob : thumbBlob || fullBlob;
  try {
    return URL.createObjectURL(chosen);
  } catch {
    return null;
  }
}

/** Delete every cached image (used when the user turns the setting off). */
export async function clearPhotoCache() {
  const db = await openDb();
  if (!db) return;
  await new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).clear();
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
      tx.onabort = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}
