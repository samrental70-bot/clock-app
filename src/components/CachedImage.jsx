import { useEffect, useRef, useState } from "react";
import {
  fetchAndCacheImage,
  getCachedObjectUrl,
  isPhotoCacheEnabled,
} from "../lib/photoCache.js";

/**
 * <img> that serves photos from the on-device cache when enabled.
 *
 * - variant="thumb": grid tiles. Uses a cached (small) thumbnail; if the image
 *   isn't cached yet it fetches once, caches full+thumb, then shows the thumb.
 * - variant="full": the photo viewer. Prefers the cached full image, else the
 *   network URL directly (no waiting on cache round-trips for a single image).
 *
 * When the cache is disabled or unavailable it transparently falls back to the
 * original network `url`, so behaviour is never worse than before.
 */
export default function CachedImage({
  url,
  variant = "thumb",
  alt = "",
  className = "",
  onReady,
  ...imgProps
}) {
  // Start full-variant from the network URL immediately (fast single-image
  // path); thumbnails start blank so the grid shows its skeleton until ready.
  const [src, setSrc] = useState(variant === "full" ? url || "" : "");
  const objectUrlRef = useRef("");

  useEffect(() => {
    let cancelled = false;
    const revokePrevious = () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = "";
      }
    };

    if (!url) {
      revokePrevious();
      setSrc("");
      return () => {};
    }

    if (!isPhotoCacheEnabled()) {
      revokePrevious();
      setSrc(url);
      return () => {};
    }

    const apply = (objectUrl) => {
      if (cancelled) {
        if (objectUrl) URL.revokeObjectURL(objectUrl);
        return;
      }
      revokePrevious();
      objectUrlRef.current = objectUrl;
      setSrc(objectUrl);
    };

    (async () => {
      const cached = await getCachedObjectUrl(url, variant);
      if (cancelled) {
        if (cached) URL.revokeObjectURL(cached);
        return;
      }
      if (cached) {
        apply(cached);
        return;
      }
      // Not cached yet. For the full viewer, show the network image right away
      // while we cache in the background; for grid thumbs, wait for the thumb.
      if (variant === "full" && url) setSrc(url);
      const fetched = await fetchAndCacheImage(url, variant);
      if (fetched) {
        apply(fetched);
      } else if (!cancelled) {
        // Cache/network failed — fall back to the plain network URL.
        setSrc(url);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [url, variant]);

  useEffect(() => {
    return () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = "";
      }
    };
  }, []);

  if (!src) {
    // Nothing to show yet (thumb still loading): render an empty img so the
    // parent's skeleton placeholder stays visible.
    return null;
  }

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      onLoad={onReady}
      {...imgProps}
    />
  );
}
