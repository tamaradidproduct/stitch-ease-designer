/**
 * Design tokens for code that can't read CSS custom properties - chiefly the
 * canvas renderer and cursor builder, which paint with literal strings.
 * Values come from src/design/tokens.json via `npm run tokens`, the same
 * source that generates src/styles/tokens.css, so the canvas and the chrome
 * can't drift apart.
 */
export { tokens, type TokenName } from "./tokens.generated";

/** `#rrggbb` (or `#rgb`) plus an alpha, as an `rgba()` string for canvas fills. */
export function alpha(hex: string, a: number): string {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? [...h].map((c) => c + c).join("") : h;
  if (!/^[0-9a-f]{6}$/i.test(full)) throw new Error(`alpha() needs a hex color, got "${hex}"`);
  const n = parseInt(full, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}
