import { DEV_SKIP_AUTH } from "../auth/useSession";
import { getSupabase } from "../supabase/client";

/**
 * Where a chart's reference image screenshot lives.
 *
 * Signed in: uploaded to this Storage bucket, one object per chart at a
 * fixed, user-id-prefixed path (`{uid}/{chartId}/reference.<ext>`) so RLS
 * can scope every read/write to its owner exactly like the `charts` table
 * does, and a replacement upload cleanly overwrites rather than orphaning
 * the old file. `ReferenceImage.ref` stores this path, never a bare URL -
 * the bucket is private, so the app always resolves a fresh signed URL
 * before drawing.
 *
 * `VITE_DEV_SKIP_AUTH` (no real session to own a Storage path): the image
 * is inlined as a `data:` URL directly in the chart's own stored JSON
 * instead. `ref` being a `data:` URL vs. a bucket path is exactly how the
 * rest of this module (and the renderer) tells the two cases apart.
 */
export const REFERENCE_IMAGE_BUCKET = "reference-images";

/** Mirrors the bucket's own `file_size_limit` - checked client-side for a fast error. */
const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

export class ReferenceImageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReferenceImageError";
  }
}

export type UploadedReferenceImage = {
  ref: string;
  naturalWidth: number;
  naturalHeight: number;
};

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error("could not read file"));
    reader.readAsDataURL(file);
  });
}

/** Uploads (or inlines, under dev-skip-auth) `file` as `chartId`'s reference image. */
export async function uploadReferenceImage(
  chartId: string,
  file: File,
): Promise<UploadedReferenceImage> {
  const ext = ALLOWED_TYPES[file.type];
  if (!ext) throw new ReferenceImageError("Reference images must be PNG, JPG, or WebP.");
  if (file.size > MAX_BYTES) throw new ReferenceImageError("Reference images must be 10 MB or smaller.");

  const bitmap = await createImageBitmap(file);
  const naturalWidth = bitmap.width;
  const naturalHeight = bitmap.height;
  bitmap.close();

  if (DEV_SKIP_AUTH) {
    const ref = await readAsDataUrl(file);
    return { ref, naturalWidth, naturalHeight };
  }

  const supabase = getSupabase();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new ReferenceImageError("Not signed in.");

  const path = `${userData.user.id}/${chartId}/reference.${ext}`;
  const { error } = await supabase.storage
    .from(REFERENCE_IMAGE_BUCKET)
    .upload(path, file, { upsert: true, contentType: file.type });
  if (error) throw error;

  return { ref: path, naturalWidth, naturalHeight };
}

/** `ref` as a URL the canvas can actually load: itself if it's already a `data:` URL, else a freshly signed one. */
export async function resolveReferenceImageUrl(ref: string): Promise<string> {
  if (ref.startsWith("data:")) return ref;
  const { data, error } = await getSupabase()
    .storage.from(REFERENCE_IMAGE_BUCKET)
    .createSignedUrl(ref, 60 * 60);
  if (error || !data) throw error ?? new Error("could not sign the reference image's URL");
  return data.signedUrl;
}

/** Deletes the uploaded file, if there is one - a no-op for an inlined `data:` ref. */
export async function removeReferenceImageFile(ref: string): Promise<void> {
  if (ref.startsWith("data:")) return;
  const { error } = await getSupabase().storage.from(REFERENCE_IMAGE_BUCKET).remove([ref]);
  if (error) throw error;
}
