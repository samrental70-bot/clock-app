const CACHE_PREFIX = "orp_local_first_cache_v1";
const QUEUE_PREFIX = "orp_local_first_queue_v1";

function hasWindow() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function safeJsonParse(value, fallback = null) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function safeJsonStringify(value, fallback = "{}") {
  try {
    return JSON.stringify(value);
  } catch {
    return fallback;
  }
}

function cleanSegment(value) {
  return String(value ?? "")
    .trim()
    .replace(/[^a-zA-Z0-9._:-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function buildLocalFirstCacheKey(...segments) {
  return [CACHE_PREFIX, ...segments.map(cleanSegment).filter(Boolean)].join(":");
}

export function buildLocalFirstQueueKey(...segments) {
  return [QUEUE_PREFIX, ...segments.map(cleanSegment).filter(Boolean)].join(":");
}

export function readLocalFirstCacheEnvelope(key, fallback = null) {
  if (!hasWindow() || !key) {
    return { value: fallback, savedAt: "", meta: {} };
  }
  const raw = window.localStorage.getItem(key);
  const parsed = safeJsonParse(raw, null);
  if (!parsed || typeof parsed !== "object") {
    return { value: fallback, savedAt: "", meta: {} };
  }
  const value = Object.prototype.hasOwnProperty.call(parsed, "value")
    ? parsed.value
    : Object.prototype.hasOwnProperty.call(parsed, "data")
      ? parsed.data
      : fallback;
  return {
    value: value ?? fallback,
    savedAt: String(parsed.savedAt || parsed.updatedAt || parsed.createdAt || ""),
    meta: parsed.meta && typeof parsed.meta === "object" ? parsed.meta : {},
  };
}

export function readLocalFirstCache(key, fallback = null) {
  return readLocalFirstCacheEnvelope(key, fallback).value;
}

export function writeLocalFirstCache(key, value, meta = {}) {
  if (!hasWindow() || !key) return value;
  const envelope = {
    savedAt: new Date().toISOString(),
    value,
    meta: meta && typeof meta === "object" ? meta : {},
    version: 1,
  };
  window.localStorage.setItem(key, safeJsonStringify(envelope));
  return value;
}

export function isLocalFirstCacheStale(savedAt, maxAgeMs = 5 * 60 * 1000) {
  if (!savedAt) return true;
  const time = new Date(savedAt).getTime();
  if (!Number.isFinite(time)) return true;
  return Date.now() - time > Math.max(0, Number(maxAgeMs) || 0);
}

export function readLocalFirstQueue(key, fallback = []) {
  if (!hasWindow() || !key) return Array.isArray(fallback) ? fallback : [];
  const raw = window.localStorage.getItem(key);
  const parsed = safeJsonParse(raw, null);
  if (!Array.isArray(parsed)) return Array.isArray(fallback) ? fallback : [];
  return parsed;
}

export function writeLocalFirstQueue(key, value) {
  if (!hasWindow() || !key) return value;
  const rows = Array.isArray(value) ? value : [];
  window.localStorage.setItem(key, safeJsonStringify(rows));
  return rows;
}

export function enqueueLocalFirstQueueItem(key, item, { dedupeKey } = {}) {
  const queue = readLocalFirstQueue(key, []);
  const now = new Date().toISOString();
  const nextItem = {
    queued_at: now,
    ...item,
  };
  const nextQueue = dedupeKey
    ? queue.filter((row) => String(row?.dedupeKey || row?.dedupe_key || "") !== String(dedupeKey))
    : [...queue];
  if (dedupeKey) nextItem.dedupeKey = dedupeKey;
  nextQueue.push(nextItem);
  writeLocalFirstQueue(key, nextQueue);
  return nextItem;
}

export function replaceLocalFirstQueueItem(key, matcher, replacement) {
  const queue = readLocalFirstQueue(key, []);
  const nextQueue = queue.map((item) => (matcher(item) ? { ...item, ...replacement } : item));
  writeLocalFirstQueue(key, nextQueue);
  return nextQueue;
}

export function removeLocalFirstQueueItem(key, matcher) {
  const queue = readLocalFirstQueue(key, []);
  const nextQueue = queue.filter((item) => !matcher(item));
  writeLocalFirstQueue(key, nextQueue);
  return nextQueue;
}

