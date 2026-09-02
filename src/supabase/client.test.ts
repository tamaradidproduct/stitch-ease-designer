import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Regression coverage for a real bug: `client.ts` used to validate/construct
 * the Supabase client at module *import* time, which threw immediately if
 * VITE_SUPABASE_URL/VITE_SUPABASE_PUBLISHABLE_KEY were unset — exactly the
 * configuration DEV_SKIP_AUTH's own .env.example guidance recommends
 * ("there's no account to sign in to"). That made the dev bypass crash
 * before it ever got a chance to skip anything.
 */
describe("getSupabase", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("importing the module never throws, even with no Supabase env vars set", async () => {
    vi.stubEnv("VITE_SUPABASE_URL", "");
    vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "");

    await expect(import("./client")).resolves.toBeDefined();
  });

  it("throws only once actually called, and only then, with no env vars set", async () => {
    vi.stubEnv("VITE_SUPABASE_URL", "");
    vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "");

    const { getSupabase } = await import("./client");
    expect(() => getSupabase()).toThrow(/Missing VITE_SUPABASE_URL/);
  });

  it("builds a real client once the env vars are present", async () => {
    vi.stubEnv("VITE_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "test-publishable-key");

    const { getSupabase } = await import("./client");
    const client = getSupabase();
    expect(client.auth).toBeTruthy();
    // Cached rather than rebuilt on every call.
    expect(getSupabase()).toBe(client);
  });
});
