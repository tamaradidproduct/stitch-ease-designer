import { resolveReferenceImageUrl } from "../storage/referenceImages";

/** Load attempts before a broken/unreachable reference image is given up on. */
const MAX_ATTEMPTS = 3;

/**
 * How many distinct images this cache keeps resident at once. A chart's
 * reference images are few, but the cache is shared across chart switches
 * within a session (see `getSharedReferenceImageCache`), so it needs a bound
 * rather than growing forever - generous enough to cover several charts'
 * worth of images without ever mattering in practice.
 */
const MAX_ENTRIES = 24;

type CacheEntry = {
  image: HTMLImageElement | null;
  pending: boolean;
  attempts: number;
};

/**
 * Every loaded reference image currently in play, keyed by its `ref` rather
 * than the resolved URL — for a Storage-backed ref, resolving mints a fresh
 * signed URL every call, which would otherwise cache-bust itself on every
 * reload even though the underlying file hasn't changed.
 *
 * Follows the same synchronous-get/async-load/onReady pattern as
 * `SpriteCache`: `get` never blocks the draw loop, a miss kicks off loading
 * in the background and returns null for that frame, and `onReady` is how
 * the caller learns to redraw once it lands. Each `ref` loads and evicts
 * independently, so several images can be in flight at once - a chart with
 * more than one reference image doesn't make them evict each other.
 */
export class ReferenceImageCache {
  private entries = new Map<string, CacheEntry>();

  constructor(private onReady: () => void) {}

  /**
   * Only the live canvas needs to redraw when a load lands, but the cache
   * itself is a singleton (see `getSharedReferenceImageCache`) shared with
   * non-React callers that don't - this lets whichever `CanvasView` is
   * currently mounted claim that callback without the cache needing to know
   * about React at all.
   */
  setOnReady(onReady: (() => void) | null): void {
    this.onReady = onReady ?? (() => {});
  }

  /** The loaded image for `ref`, or null if it isn't ready yet (or `ref` is null). */
  get(ref: string | null): HTMLImageElement | null {
    if (!ref) return null;

    let entry = this.entries.get(ref);
    if (entry) {
      // Re-insert to mark it most-recently-used for the eviction below.
      this.entries.delete(ref);
      this.entries.set(ref, entry);
    } else {
      entry = { image: null, pending: false, attempts: 0 };
      this.entries.set(ref, entry);
      this.evictOldest();
    }

    if (entry.image) return entry.image;
    if (entry.attempts >= MAX_ATTEMPTS) return null;

    if (!entry.pending) {
      entry.pending = true;
      void this.load(ref, entry);
    }
    return null;
  }

  /**
   * Whether `ref` has finished loading one way or another - either it
   * decoded, or it's been retried `MAX_ATTEMPTS` times and given up. Lets a
   * caller that caches work keyed on "every image is settled" (see
   * `extractExemplars`) distinguish that from "still loading", so a
   * permanently broken image doesn't force it to redo that work forever.
   */
  isReady(ref: string | null): boolean {
    if (!ref) return true;
    const entry = this.entries.get(ref);
    return entry ? entry.image !== null || (!entry.pending && entry.attempts >= MAX_ATTEMPTS) : false;
  }

  private evictOldest(): void {
    while (this.entries.size > MAX_ENTRIES) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
  }

  private async load(ref: string, entry: CacheEntry): Promise<void> {
    try {
      const url = await resolveReferenceImageUrl(ref);
      const img = new Image();
      // The production app is served from app.stitch-ease.com while uploaded
      // references are read from Supabase Storage. The browser will happily
      // *display* that cross-origin image without this flag, but drawing it
      // into the crop canvas then makes its pixels unreadable. Suggest calls
      // getImageData() to compare crops, so it silently failed for every
      // authenticated (Storage-backed) image while working with local data:
      // URLs. Set this before `src` so Supabase's CORS response keeps the
      // canvas origin-clean and usable by the matcher.
      //
      // data: URLs (DEV_SKIP_AUTH, or before an image finishes uploading)
      // carry no CORS headers to satisfy, and some browsers fail the load
      // entirely rather than ignore crossOrigin on one - so it's only set
      // for an actual cross-origin request.
      if (!url.startsWith("data:")) img.crossOrigin = "anonymous";
      img.src = url;
      await img.decode();
      if (this.entries.get(ref) !== entry) return; // evicted, or replaced, while this was loading
      entry.image = img;
      entry.attempts = 0;
      this.onReady();
    } catch (err) {
      if (this.entries.get(ref) !== entry) return;
      entry.attempts += 1;
      if (entry.attempts >= MAX_ATTEMPTS) {
        console.error(
          `ReferenceImageCache: giving up loading the reference image after ${entry.attempts} attempts`,
          err,
        );
      }
    } finally {
      if (this.entries.get(ref) === entry) entry.pending = false;
    }
  }
}

let sharedCache: ReferenceImageCache | null = null;

export function getSharedReferenceImageCache(): ReferenceImageCache {
  if (!sharedCache) {
    sharedCache = new ReferenceImageCache(() => {});
  }
  return sharedCache;
}
