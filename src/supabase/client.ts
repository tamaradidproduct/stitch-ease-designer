import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!url || !publishableKey) {
  throw new Error(
    "Missing VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY. Copy .env.example to .env " +
      "and fill them in (see README), or set them as repo variables for the deploy workflow.",
  );
}

/**
 * The one Supabase client for the app.
 *
 * `flowType: "pkce"` is required here, not a default worth double-checking:
 * Supabase's implicit flow returns the session in the URL *fragment*
 * (`#access_token=...`), which collides with HashRouter's own use of the
 * fragment for routing (`#/c/abc`) — the auth redirect would land on top of
 * a route path instead of a token. PKCE returns `?code=...` in the query
 * string instead, which HashRouter doesn't touch.
 */
export const supabase = createClient(url, publishableKey, {
  auth: { flowType: "pkce" },
});
