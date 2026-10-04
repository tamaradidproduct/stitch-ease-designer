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

/**
 * Section order for browsing/searching the library; anything uncategorized
 * sorts last. Deliberately its own constant, not a shared one with
 * registry.ts's (unexported, export-image-only) CATEGORY_ORDER: that one
 * puts decreases before increases, a different editorial call for a
 * different context, not a value the two should be kept in sync with.
 */
const CATEGORY_ORDER = ["basic", "increase", "decrease", "cable", "brioche", "special"];
const CATEGORY_LABELS: Record<string, string> = {
  basic: "Basic stitches",
  increase: "Increases",
  decrease: "Decreases",
  cable: "Cables",
  brioche: "Brioche",
  special: "Special",
};

export type SymbolSection = { key: string; title: string; symbols: StitchSymbol[] };

/**
 * The one stitch search the picker and the glossary share. With no query it
 * browses everything not already in the glossary; a typed query surfaces
 * every match, glossary entries included (callers tag those "Added").
 * Grouped by category so the library reads as a glossary, not a wall of
 * stitches - Array.prototype.sort is stable, so search relevance survives
 * within each category.
 */
export function browseSymbols(
  symbols: readonly StitchSymbol[],
  query: string,
  inGlossary: (symbolId: string) => boolean,
): SymbolSection[] {
  const rank = (category: string) => {
    const at = CATEGORY_ORDER.indexOf(category);
    return at === -1 ? CATEGORY_ORDER.length : at;
  };
  const matches = (query.trim() ? searchSymbols(symbols, query) : symbols.filter((s) => !inGlossary(s.id)))
    .sort((a, b) => rank(a.category) - rank(b.category));
  const sections: SymbolSection[] = [];
  for (const symbol of matches) {
    const current = sections[sections.length - 1];
    if (current?.key === symbol.category) current.symbols.push(symbol);
    else sections.push({ key: symbol.category, title: CATEGORY_LABELS[symbol.category] ?? symbol.category, symbols: [symbol] });
  }
  return sections;
}

/**
 * Motifs matching a typed query. Every motif already has a glossary row, so
 * with no query there's nothing to browse - same as an added stitch.
 */
export function searchMotifs<T extends { name: string }>(motifs: readonly T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  return q ? motifs.filter((motif) => motif.name.toLowerCase().includes(q)) : [];
}
