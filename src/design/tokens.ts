/**
 * Color tokens for code that can't read CSS custom properties - chiefly the
 * canvas renderer, which paints with literal strings. Each value here mirrors
 * the same-named `--token` in src/styles/tokens.css; tokens.test.ts fails if
 * the two drift, so change both together.
 */
export const colorTokens = {
  bg: "#ffffff",
  chrome: "#f8fafc",
  border: "#e2e8f0",
  text: "#0f172a",
  "text-muted": "#64748b",
  "text-subtle": "#94a3b8",
  accent: "#0284c7",
  "accent-soft-bg": "#e0f2fe",
  "cell-stroke": "#94a3b8",
  "cell-ink": "#334155",
} as const;

export type ColorToken = keyof typeof colorTokens;
