import type { StitchSymbol } from "../symbols/types";

/**
 * Search across id, label, category, and the expanded knitting names behind
 * common abbreviations. The UI can stay compact ("K2tog") without forcing a
 * designer to remember or type the abbreviation to find it.
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

const EXPANDED_NAMES: Record<string, readonly string[]> = {
  k2tog: ["knit two together", "knit 2 together"],
  k2tog_alt: ["knit two together", "knit 2 together"],
  p2tog: ["purl two together", "purl 2 together"],
  p3tog: ["purl three together", "purl 3 together"],
  sk2po: ["slip knit two pass over", "slip knit 2 pass over"],
  skpo: ["slip knit pass over", "slip slip knit"],
  ssk_alt: ["slip slip knit", "slip knit pass over"],
  ssp: ["slip slip purl"],
  tk2tog: ["twisted knit two together", "twisted knit 2 together"],
  tssk: ["twisted slip slip knit"],
  m1: ["make one"],
  m1l: ["make one left"],
  m1lp: ["make one left purlwise"],
  m1r: ["make one right"],
  m1rp: ["make one right purlwise"],
};

const expandedNames = (s: StitchSymbol) => EXPANDED_NAMES[s.id] ?? [];

const haystack = (s: StitchSymbol) =>
  normalise(`${s.id} ${s.label} ${s.category} ${expandedNames(s).join(" ")}`);

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
    else if (expandedNames(symbol).some((name) => normalise(name).startsWith(q))) score = 2;

    scored.push({ symbol, score });
  }

  return scored
    .sort((a, b) => a.score - b.score || a.symbol.span - b.symbol.span)
    .map((s) => s.symbol);
}
