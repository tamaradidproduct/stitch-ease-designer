/** Shared file-download plumbing for every export format. */

/** A chart name turned into a safe filename with the given extension. */
export function safeFilename(name: string, extension: string): string {
  const base = name.trim().replace(/[^\w.-]+/g, "-").replace(/^-+|-+$/g, "") || "chart";
  return `${base}.${extension}`;
}

/** Triggers a browser download of `blob` as `filename`. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  // Some browsers only honour a click on an anchor that's actually in the
  // document.
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoking immediately can cancel the download in some browsers; a tick is
  // enough for the click to have been handled.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
