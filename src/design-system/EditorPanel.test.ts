import { describe, expect, it } from "vitest";
import { sessionUrlFrom } from "./EditorPanel";

describe("EditorPanel session url parsing", () => {
  it("extracts a session url from string payloads", () => {
    expect(sessionUrlFrom("started session_AbC123")).toBe("https://claude.ai/code/session_AbC123");
  });

  it("returns null for circular payloads instead of throwing", () => {
    const payload: Record<string, unknown> = {};
    payload.self = payload;

    expect(sessionUrlFrom(payload)).toBeNull();
  });
});
