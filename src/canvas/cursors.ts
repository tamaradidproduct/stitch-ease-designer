/**
 * Custom cursor for an Alt/Opt-drag duplicate.
 *
 * The native "copy" cursor renders wildly differently per OS (a green
 * circled plus on macOS, a small boxed plus on Windows, nothing extra on
 * some Linux setups), so a plain `cursor: "copy"` doesn't read as
 * consistently "this will duplicate" the way it does in a design tool. This
 * draws the same idea ourselves: a pointer with a small "+" badge, styled to
 * match the app rather than the OS.
 */
const DUPLICATE_CURSOR_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
  <path d="M2 2 L2 18 L6.5 14.5 L9 20 L11.5 19 L9 13.5 L15 13.5 Z"
        fill="#0f172a" stroke="#ffffff" stroke-width="1.5" stroke-linejoin="round" />
  <rect x="13" y="13" width="9" height="9" rx="2" fill="#0284c7" stroke="#ffffff" stroke-width="1.2" />
  <path d="M17.5 15.2 v4.6 M15.2 17.5 h4.6" stroke="#ffffff" stroke-width="1.4" stroke-linecap="round" />
</svg>
`.trim();

/** Hotspot at the arrow's own tip (2, 2), so it aligns like a normal pointer. */
export const DUPLICATE_CURSOR = `url("data:image/svg+xml,${encodeURIComponent(DUPLICATE_CURSOR_SVG)}") 2 2, copy`;
