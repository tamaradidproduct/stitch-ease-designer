import { describe, expect, it } from "vitest";
import { DEFAULT_CHART_NAME } from "./DocStore";
import { importChart } from "./exportImport";
import { emptyChart } from "./serialize";

const jsonFile = (name: string, body: unknown) =>
  new File([JSON.stringify(body)], name, { type: "application/json" });

describe("importChart", () => {
  it("prefers the name stored in the file", async () => {
    const file = jsonFile("whatever.json", { ...emptyChart(), name: "Peacock yoke" });
    expect((await importChart(file)).name).toBe("Peacock yoke");
  });

  it("falls back to the filename when the file has no name", async () => {
    const file = jsonFile("Gansey.stitchchart.json", emptyChart());
    expect((await importChart(file)).name).toBe("Gansey");
  });

  it("falls back to a default name rather than an empty string when both are blank", async () => {
    // A file literally named ".json" reduces to "" once the extension is
    // stripped, and the stored chart has no name of its own either.
    const file = jsonFile(".json", { ...emptyChart(), name: "   " });
    expect((await importChart(file)).name).toBe(DEFAULT_CHART_NAME);
  });
});
