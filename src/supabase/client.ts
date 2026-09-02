import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null = null;

/**
 * The one Supabase client for the app, built on first actual use rather than
 * at import time.
 *
 * That laziness matters for `DEV_SKIP_AUTH` (see auth/useSession.ts): its own
 * .env.example guidance is to leave VITE_SUPABASE_URL/
 * VITE_SUPABASE_PUBLISHABLE_KEY unset entirely ("there's no account to sign
 * in to"). Nothing under that flag ever calls this function — useSession's
 * effect returns before touching it, and the Supabase-backed branch of
 * App.tsx can't render — so the missing-env-vars check below never has to
 * run. A plain top-level `export const supabase = createClient(...)` would
 * validate and construct eagerly at import time, throwing before any of that
 * branching gets a chance to run at all.
 */
export function getSupabase(): SupabaseClient {
  if (cached) return cached;

  const url = import.meta.env.VITE_SUPABASE_URL;
  const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !publishableKey) {
    throw new Error(
      "Missing VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY. Copy .env.example to .env " +
        "and fill them in (see README), or set them as repo variables for the deploy workflow.",
    );
  }

  // `flowType: "pkce"` is required here, not a default worth double-checking:
  // Supabase's implicit flow returns the session in the URL *fragment*
  // (`#access_token=...`), which collides with HashRouter's own use of the
  // fragment for routing (`#/c/abc`) — the auth redirect would land on top of
  // a route path instead of a token. PKCE returns `?code=...` in the query
  // string instead, which HashRouter doesn't touch.
  cached = createClient(url, publishableKey, { auth: { flowType: "pkce" } });
  return cached;
}
