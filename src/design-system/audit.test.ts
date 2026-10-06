import { describe, expect, it } from "vitest";
import { backlog } from "./audit";

describe("consolidation backlog", () => {
  it("counts live items from the source", () => {
    const byId = Object.fromEntries(backlog.map((i) => [i.id, i]));
    expect(byId["bespoke-buttons"]!.count).toBeGreaterThan(0);
    expect(byId["inline-svg"]!.count).toBe(0);
    expect(byId["large-files"]!.where.some((w) => w.startsWith("RightPanel.tsx"))).toBe(true);
  });

  it("gives every item a unique id and a request Claude Code can act on", () => {
    expect(new Set(backlog.map((i) => i.id)).size).toBe(backlog.length);
    for (const item of backlog) expect(item.request.length).toBeGreaterThan(40);
  });
});
