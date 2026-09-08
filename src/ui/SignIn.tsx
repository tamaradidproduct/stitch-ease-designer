import { useState } from "react";
import { sendMagicLink, signInWithGoogle } from "../auth/useSession";

export function SignIn() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);
  const [googleBusy, setGoogleBusy] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("sending");
    setError(null);

    const result = await sendMagicLink(email.trim());
    if (result.ok) {
      setStatus("sent");
    } else {
      setStatus("idle");
      setError(result.message);
    }
  };

  const onGoogleClick = async () => {
    setGoogleBusy(true);
    setError(null);
    const result = await signInWithGoogle();
    // A success here just means the redirect to Google started - this
    // component unmounts as the browser navigates away, so there's no
    // "signed in" state to set. Only a failure to even start it needs
    // showing; setGoogleBusy(false) would otherwise flash the button back
    // right before navigation anyway.
    if (!result.ok) {
      setGoogleBusy(false);
      setError(result.message);
    }
  };

  return (
    <main className="signIn">
      <div className="signIn__card">
        <h1 className="signIn__title">Stitch Ease Designer</h1>

        {status === "sent" ? (
          <p className="signIn__sent">
            Check <strong>{email}</strong> for a sign-in link. You can close this tab.
          </p>
        ) : (
          <>
            <button
              type="button"
              className="signIn__google"
              onClick={onGoogleClick}
              disabled={googleBusy}
            >
              <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">
                <path
                  fill="#4285F4"
                  d="M19.6 10.23c0-.68-.06-1.33-.17-1.96H10v3.71h5.38a4.6 4.6 0 0 1-2 3.02v2.5h3.23c1.9-1.75 2.99-4.32 2.99-7.27Z"
                />
                <path
                  fill="#34A853"
                  d="M10 20c2.7 0 4.96-.89 6.61-2.42l-3.23-2.5c-.9.6-2.04.95-3.38.95-2.6 0-4.8-1.75-5.59-4.11H1.08v2.59A10 10 0 0 0 10 20Z"
                />
                <path
                  fill="#FBBC05"
                  d="M4.41 11.92a6 6 0 0 1 0-3.84V5.49H1.08a10 10 0 0 0 0 9.02l3.33-2.59Z"
                />
                <path
                  fill="#EA4335"
                  d="M10 3.98c1.47 0 2.79.5 3.82 1.5l2.87-2.87A9.6 9.6 0 0 0 10 0 10 10 0 0 0 1.08 5.49l3.33 2.59C5.2 5.72 7.4 3.98 10 3.98Z"
                />
              </svg>
              {googleBusy ? "Redirecting…" : "Continue with Google"}
            </button>

            <div className="signIn__divider">or</div>

            <form className="signIn__form" onSubmit={onSubmit}>
              <label className="signIn__label" htmlFor="email">
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                disabled={status === "sending"}
              />
              <button type="submit" disabled={status === "sending" || !email.trim()}>
                {status === "sending" ? "Sending…" : "Send sign-in link"}
              </button>
            </form>

            {error && <p className="signIn__error">{error}</p>}
          </>
        )}

        <p className="signIn__hint">
          Invite-only while this is in testing. Ask for an invite if you don't have one yet.
        </p>
      </div>
    </main>
  );
}
