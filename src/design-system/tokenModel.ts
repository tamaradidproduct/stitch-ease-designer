import source from "../design/tokens.json";

export type TokenType = "color" | "font" | "dimension" | "shadow" | "number" | "motion";
export type TokenDef = { name: string; value: string; description: string; group: string; groupLabel: string; type: TokenType };
export type TokenGroup = { id: string; label: string; type: TokenType; tokens: TokenDef[] };

export const groups: TokenGroup[] = source.groups.map((g) => ({
  id: g.id,
  label: g.label,
  type: g.type as TokenType,
  tokens: Object.entries(g.tokens as Record<string, { value: string; description?: string }>).map(([name, t]) => ({
    name,
    value: t.value,
    description: t.description ?? "",
    group: g.id,
    groupLabel: g.label,
    type: g.type as TokenType,
  })),
}));

export const allTokens: TokenDef[] = groups.flatMap((g) => g.tokens);
export const tokenByName = new Map(allTokens.map((t) => [t.name, t]));

/** Token edits keyed by name; only names whose value differs from tokens.json. */
export type Edits = Record<string, string>;

/** Why a value can't be written to tokens.json, or null when it's fine. */
export function invalidReason(value: string): string | null {
  if (!value.trim()) return "Enter a value.";
  if (/[;{}]/.test(value)) return "Values can't contain ; { or }.";
  if (value.length > 200) return "That value is too long.";
  return null;
}

export function isHex(value: string): boolean {
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value.trim());
}

/** `#abc` -> `#aabbcc`, for <input type="color">, which only takes 6 digits. */
export function toHex6(value: string): string {
  const v = value.trim();
  if (/^#[0-9a-f]{3}$/i.test(v)) return "#" + [...v.slice(1)].map((c) => c + c).join("");
  return v;
}

export function cleanEdits(edits: Edits): Edits {
  const out: Edits = {};
  for (const [name, value] of Object.entries(edits)) {
    const base = tokenByName.get(name);
    if (base && value !== base.value && !invalidReason(value)) out[name] = value;
  }
  return out;
}

/** The instruction a fresh Claude Code session follows to apply the edits. */
export function changeRequestPrompt(edits: Edits, note: string, artifactUrl: string): string {
  const rows = Object.entries(edits)
    .map(([name, value]) => `- \`${name}\`: \`${tokenByName.get(name)?.value}\` -> \`${value}\``)
    .join("\n");
  return [
    "Apply design-system changes made on the Stitch Ease design-system page to the app.",
    "",
    "Repository: https://github.com/tamaradidproduct/stitch-ease-designer (follow its CLAUDE.md).",
    "",
    "1. Start a new branch from the latest `main`, named `design-tokens/<today's date>-<short slug>`.",
    rows
      ? `2. In \`src/design/tokens.json\`, set these token values (old -> new):\n${rows}`
      : "2. No token values changed.",
    note.trim() ? `3. Also make these requested changes:\n${note.trim()}` : "3. No other changes were requested.",
    "4. Run `npm run tokens` to regenerate `src/styles/tokens.css` and `src/design/tokens.generated.ts`, then `npm run design-system` to rebuild the page. Never hand-edit generated files.",
    "5. Run `npm run build`, `npm run lint` and `npm test`, and fix anything they report.",
    "6. Commit, push, and open a pull request titled `Design tokens: <summary>`. In the body, list every change with its old and new value. Do not merge it.",
    `7. If you have the Artifact tool, republish ${artifactUrl} from \`dist-design-system/artifact.html\` so the page shows the new values.`,
    "8. Reply with the pull request link.",
  ].join("\n");
}
