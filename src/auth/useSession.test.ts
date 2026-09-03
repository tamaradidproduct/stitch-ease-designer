import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Regression coverage for a real bug: sendMagicLink is typed as always
 * resolving to a SendMagicLinkResult, but calling the (now lazy) Supabase
 * client without env vars configured threw synchronously inside this async
 * function, turning the promise into a rejection instead. SignIn.tsx awaits
 * this with no try/catch, so that rejection left its "Sending…" button
 * stuck forever with no visible error.
 */
describe("sendMagicLink", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("resolves with a normal error result instead of rejecting when Supabase isn't configured", async () => {
    vi.stubEnv("VITE_SUPABASE_URL", "");
    vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "");

    const { sendMagicLink } = await import("./useSession");
    const result = await sendMagicLink("designer@example.com");

    expect(result).toMatchObject({ ok: false, reason: "error" });
    if (!result.ok) expect(result.message).toMatch(/Missing VITE_SUPABASE_URL/);
  });
});
