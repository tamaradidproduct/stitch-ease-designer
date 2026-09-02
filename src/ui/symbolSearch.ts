import type { StitchSymbol } from "../symbols/types";

/**
 * Search across id, label and category.
 *
 * Knitters write cables as "3/3" but the ids use "3_3", and a search for
 * "k2tog" should not care whether the library spells it "K2tog". Both sides
 * are normalised so either spelling finds the stitch.
 */
const normalise = (text: string) =>
  text.toLowerCase().replace(/[/\-\s]+/g, "_").replace(/_+/g, "_");

/**
 * Split on whitespace *first*, then normalise each word.
 *
 * Normalising before splitting would turn "3/3" into "3_3" and then into two
 * separate "3" tokens, so a search for a 3/3 cable would also match 3/4 — the
 * pairing has to survive tokenising.
 */
const tokenise = (query: string) =>
  query
    .trim()
    .split(/\s+/)
    .map((word) => normalise(word).replace(/^_|_$/g, ""))
    .filter(Boolean);

const haystack = (s: StitchSymbol) =>
  normalise(`${s.id} ${s.label} ${s.category}`);

export function searchSymbols(
  symbols: readonly StitchSymbol[],
  query: string,
): StitchSymbol[] {
  const tokens = tokenise(query);
  if (!tokens.length) return [...symbols];

  const q = tokens.join("_");
  const scored: { symbol: StitchSymbol; score: number }[] = [];

  for (const symbol of symbols) {
    const hay = haystack(symbol);
    if (!tokens.every((t) => hay.includes(t))) continue;

    // Rank so that typing "purl" puts purl above every purl cable.
    const id = normalise(symbol.id);
    let score = 3;
    if (id === q) score = 0;
    else if (id.startsWith(q)) score = 1;
    else if (normalise(symbol.label).startsWith(q)) score = 2;

    scored.push({ symbol, score });
  }

  return scored
    .sort((a, b) => a.score - b.score || a.symbol.span - b.symbol.span)
    .map((s) => s.symbol);
}
