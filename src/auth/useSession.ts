import type { Session } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import { getSupabase } from "../supabase/client";

export type SessionState =
  | { status: "loading" }
  | { status: "signedOut" }
  | { status: "signedIn"; backend: "supabase"; session: Session }
  | { status: "signedIn"; backend: "devLocal" };

/**
 * Dev-only bypass of real sign-in, so the app is usable without a magic-link
 * round trip every time local storage or the session is cleared.
 *
 * Two gates, not one: `import.meta.env.DEV` is statically replaced with
 * `false` by Vite for `vite build`, so in a production bundle this constant
 * is hardcoded `false` and the branch below that reads it is dead-code-
 * eliminated — confirmed by grepping dist/: neither the `DEV_SKIP_AUTH`
 * identifier nor its UI string survive. `useSession()` can therefore never
 * produce a `backend: "devLocal"` state in production, which is what
 * actually matters; the `DevLocal` component in App.tsx that switches on
 * that tag is unreachable dead code there, not physically stripped (a
 * minifier can't prove that across the module boundary the way it can
 * within this file), but it can never execute. The explicit opt-in on top of
 * `DEV` means it's still off by default for anyone running `vite dev` who
 * wants to exercise the real sign-in flow locally.
 */
export const DEV_SKIP_AUTH =
  import.meta.env.DEV && import.meta.env.VITE_DEV_SKIP_AUTH === "true";

/**
 * The current auth session, kept in sync with Supabase's own state.
 *
 * `getSession()` on mount handles the case where a session already exists in
 * storage (a returning visitor); `onAuthStateChange` handles everything after
 * — sign-in, sign-out, token refresh, and the redirect back from a magic-link
 * email completing the PKCE exchange.
 *
 * Under `DEV_SKIP_AUTH`, none of that runs — no `getSession`, no
 * subscription, no request to Supabase at all. The state is a constant.
 */
export function useSession(): SessionState {
  const [state, setState] = useState<SessionState>(
    DEV_SKIP_AUTH ? { status: "signedIn", backend: "devLocal" } : { status: "loading" },
  );

  useEffect(() => {
    if (DEV_SKIP_AUTH) return;

    let cancelled = false;
    let supabase;
    try {
      supabase = getSupabase();
    } catch {
      // Missing/invalid env vars (and DEV_SKIP_AUTH isn't on). There's no
      // error boundary anywhere in the app, so letting this throw
      // uncaught would blank the whole page instead of showing anything —
      // fall through to the sign-in screen instead, where attempting to
      // actually sign in surfaces the real message (sendMagicLink hits the
      // same getSupabase() call and reports it properly).
      setState({ status: "signedOut" });
      return;
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (cancelled) return;
      setState(
        session ? { status: "signedIn", backend: "supabase", session } : { status: "signedOut" },
      );
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      if (cancelled) return;
      setState(
        session ? { status: "signedIn", backend: "supabase", session } : { status: "signedOut" },
      );
    });

    return () => {
      cancelled = true;
      subscription.subscription.unsubscribe();
    };
  }, []);

  return state;
}

export type SendMagicLinkResult =
  | { ok: true }
  | { ok: false; reason: "not-invited" | "error"; message: string };

/**
 * Requests a magic-link sign-in email.
 *
 * `shouldCreateUser: false` is what makes the app invite-only from the
 * client's side: Supabase auth-level "disable signups" already blocks
 * account creation, but without this flag an uninvited email would get a
 * generic-looking "check your email" success message and only fail silently
 * (no email actually sent) — confusing rather than clearly rejected. With it,
 * Supabase returns an error we can catch and label accurately.
 */
export async function sendMagicLink(email: string): Promise<SendMagicLinkResult> {
  let supabase;
  try {
    supabase = getSupabase();
  } catch (caught) {
    // Missing/invalid env vars. Reported through the normal error path
    // rather than left to reject this promise - the caller (SignIn) awaits
    // this expecting a result, not a throw, and has no catch of its own.
    return {
      ok: false,
      reason: "error",
      message: caught instanceof Error ? caught.message : "Could not send sign-in link",
    };
  }

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: false,
      emailRedirectTo: window.location.origin + window.location.pathname,
    },
  });

  if (!error) return { ok: true };

  // Confirmed live against this project, not just from the docs (which point
  // at a different, more generic-sounding code): an uninvited email with
  // shouldCreateUser: false comes back as AuthApiError, status 422,
  // code "otp_disabled", message "Signups not allowed for otp".
  const notInvited = error.code === "otp_disabled";
  return {
    ok: false,
    reason: notInvited ? "not-invited" : "error",
    message: notInvited
      ? "That email hasn't been invited yet. Ask for an invite and try again."
      : error.message,
  };
}

export async function signOut(): Promise<void> {
  await getSupabase().auth.signOut();
}
