import { useState } from "react";
import { sendMagicLink, signInWithGoogle } from "../auth/useSession";
import { GoogleLogo } from "./icons";
import { Button } from "./Button";

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
            <Button variant="unstyled"
              className="signIn__google"
              onClick={onGoogleClick}
              disabled={googleBusy || status === "sending"}
            >
              <GoogleLogo width="16" height="16" />
              {googleBusy ? "Redirecting…" : "Continue with Google"}
            </Button>

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
                disabled={status === "sending" || googleBusy}
              />
              <Button variant="unstyled" type="submit" disabled={status === "sending" || googleBusy || !email.trim()}>
                {status === "sending" ? "Sending…" : "Send sign-in link"}
              </Button>
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
