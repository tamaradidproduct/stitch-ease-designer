/**
 * Component geometry: declarations in src/styles/*.css that still use a raw
 * px value, i.e. sizes and offsets that belong to one component rather than
 * the token scale. Listed on the page so nothing styling the app is hidden.
 */
const sheets = import.meta.glob<string>("../styles/*.css", { query: "?raw", import: "default", eager: true });

export type GeometryRow = { file: string; selector: string; declaration: string };

export const geometry: GeometryRow[] = Object.entries(sheets)
  .filter(([file]) => !file.endsWith("/tokens.css"))
  .flatMap(([file, text]) => {
    const rows: GeometryRow[] = [];
    let selector = "";
    for (const raw of text.replace(/\/\*[\s\S]*?\*\//g, "").split("\n")) {
      const line = raw.trim();
      if (line.endsWith("{")) selector = line.slice(0, -1).trim();
      else if (line.endsWith(",") && !line.includes(":")) selector = line;
      const decl = line.match(/^([a-z-]+):\s*(.+);$/);
      if (decl && /(^|[\s(,/])-?\d*\.?\d+px/.test(decl[2]!)) {
        rows.push({ file: file.replace("../styles/", "styles/"), selector, declaration: `${decl[1]}: ${decl[2]}` });
      }
    }
    return rows;
  });
