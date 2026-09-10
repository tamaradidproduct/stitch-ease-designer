import { resolveReferenceImageUrl } from "../storage/referenceImages";

/** Load attempts before a broken/unreachable reference image is given up on. */
const MAX_ATTEMPTS = 3;

/**
 * The one loaded reference image, keyed by its `ref` rather than the
 * resolved URL — for a Storage-backed ref, resolving mints a fresh signed
 * URL every call, which would otherwise cache-bust itself on every reload
 * even though the underlying file hasn't changed.
 *
 * Follows the same synchronous-get/async-load/onReady pattern as
 * `SpriteCache`: `get` never blocks the draw loop, a miss kicks off loading
 * in the background and returns null for that frame, and `onReady` is how
 * the caller learns to redraw once it lands.
 */
export class ReferenceImageCache {
  private ref: string | null = null;
  private image: HTMLImageElement | null = null;
  private pending = false;
  private attempts = 0;

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
    if (ref !== this.ref) {
      this.ref = ref;
      this.image = null;
      this.pending = false;
      this.attempts = 0;
    }
    if (!ref) return null;
    if (this.image) return this.image;
    if (this.attempts >= MAX_ATTEMPTS) return null;

    if (!this.pending) {
      this.pending = true;
      void this.load(ref);
    }
    return null;
  }

  private async load(ref: string): Promise<void> {
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
      img.crossOrigin = "anonymous";
      img.src = url;
      await img.decode();
      if (ref !== this.ref) return; // a different (or no) image was set while this was loading
      this.image = img;
      this.attempts = 0;
      this.onReady();
    } catch (err) {
      if (ref !== this.ref) return;
      this.attempts += 1;
      if (this.attempts >= MAX_ATTEMPTS) {
        console.error(
          `ReferenceImageCache: giving up loading the reference image after ${this.attempts} attempts`,
          err,
        );
      }
    } finally {
      if (ref === this.ref) this.pending = false;
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
