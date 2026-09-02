import type { Session } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import { supabase } from "../supabase/client";

export type SessionState =
  | { status: "loading" }
  | { status: "signedOut" }
  | { status: "signedIn"; session: Session };

/**
 * The current auth session, kept in sync with Supabase's own state.
 *
 * `getSession()` on mount handles the case where a session already exists in
 * storage (a returning visitor); `onAuthStateChange` handles everything after
 * — sign-in, sign-out, token refresh, and the redirect back from a magic-link
 * email completing the PKCE exchange.
 */
export function useSession(): SessionState {
  const [state, setState] = useState<SessionState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (cancelled) return;
      setState(session ? { status: "signedIn", session } : { status: "signedOut" });
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      if (cancelled) return;
      setState(session ? { status: "signedIn", session } : { status: "signedOut" });
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
  await supabase.auth.signOut();
}
