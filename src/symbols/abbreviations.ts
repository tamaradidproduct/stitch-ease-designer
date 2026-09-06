import { getSymbol } from "./registry";

/**
 * Short knitter-facing codes for CSV export - not part of the Figma-synced
 * symbol library (`symbols.generated.ts`), so a resync never touches this.
 * Hand-picked to match common chart-key conventions rather than derived from
 * the label, which reads more like a UI tooltip than a stitch code (e.g.
 * "1/1 purl cable, left (HR)" vs "1/1LPC-HR").
 */
const ABBREVIATIONS: Record<string, string> = {
  knit: "K",
  ktbl: "K-tbl",
  p3: "K3/P3",
  ptbl: "P-tbl",
  purl: "P",
  brk: "brk",
  brp: "brp",

  "1_1_left_cable": "1/1LC",
  "1_1_left_cable_hr": "1/1LC-HR",
  "1_1_left_purl_cable": "1/1LPC",
  "1_1_left_purl_cable_hr": "1/1LPC-HR",
  "1_1_right_cable": "1/1RC",
  "1_1_right_cable_hr": "1/1RC-HR",
  "1_1_right_purl_cable": "1/1RPC",
  "1_1_right_purl_cable_hr": "1/1RPC-HR",
  "2_1_left_purl_cable": "2/1LPC",
  "2_1_left_purl_cable_hr": "2/1LPC-HR",
  "2_1_right_purl_cable": "2/1RPC",
  "2_1_right_purl_cable_hr": "2/1RPC-HR",
  "2_2_left_cable": "2/2LC",
  "2_2_left_cable_hr": "2/2LC-HR",
  "2_2_left_purl_cable": "2/2LPC",
  "2_2_left_purl_cable_hr": "2/2LPC-HR",
  "2_2_right_cable": "2/2RC",
  "2_2_right_cable_hr": "2/2RC-HR",
  "2_2_right_purl_cable": "2/2RPC",
  "2_2_right_purl_cable_hr": "2/2RPC-HR",
  "3_3_left_cable": "3/3LC",
  "3_3_left_cable_hr": "3/3LC-HR",
  "3_3_right_cable": "3/3RC",
  "3_3_right_cable_hr": "3/3RC-HR",
  "3_4_left_cable": "3/4LC",
  "3_4_left_cable_hr": "3/4LC-HR",
  "3_4_right_cable": "3/4RC",
  "3_4_right_cable_hr": "3/4RC-HR",
  "4_4_left_cable": "4/4LC",
  "4_4_left_cable_hr": "4/4LC-HR",
  "4_4_right_cable": "4/4RC",
  "4_4_right_cable_hr": "4/4RC-HR",

  central_double_decrease: "CDD",
  k2tog: "K2tog",
  k2tog_alt: "K2tog*",
  p2tog: "P2tog",
  p3tog: "P3tog",
  sk2po: "SK2P",
  skpo: "SSK",
  ssk_alt: "SSK*",
  ssp: "SSP",
  tk2tog: "tK2tog",
  tssk: "tSSK",

  m1: "M1",
  m1l: "M1L",
  m1lp: "M1Lp",
  m1r: "M1R",
  m1rp: "M1Rp",

  yarn_over: "YO",
  empty: "×",
  ghost_purl: "gP",
  pull_up_stitch: "PU",
  repeated: "rep",
  row_number: "#",
};

/**
 * Derives a short code for a symbol the hand-picked table above doesn't
 * cover yet - initials of the label's words, so a new library symbol still
 * gets something readable in CSV instead of silently falling through to its
 * raw id.
 */
export function deriveAbbreviation(label: string): string {
  const initials = label
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((word) => word[0]!.toUpperCase())
    .join("");
  return initials.slice(0, 6) || label.slice(0, 6);
}

/** Short knitter-facing code for a symbol, for CSV cells and legends. */
export function abbreviationFor(symbolId: string): string {
  const known = ABBREVIATIONS[symbolId];
  if (known) return known;
  const symbol = getSymbol(symbolId);
  return symbol ? deriveAbbreviation(symbol.label) : symbolId;
}
