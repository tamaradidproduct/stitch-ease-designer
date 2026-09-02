import { useState } from "react";
import { sendMagicLink } from "../auth/useSession";

export function SignIn() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

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

  return (
    <main className="signIn">
      <div className="signIn__card">
        <h1 className="signIn__title">Stitch Ease Designer</h1>

        {status === "sent" ? (
          <p className="signIn__sent">
            Check <strong>{email}</strong> for a sign-in link. You can close this tab.
          </p>
        ) : (
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
            {error && <p className="signIn__error">{error}</p>}
          </form>
        )}

        <p className="signIn__hint">
          Invite-only while this is in testing. Ask for an invite if you don't have one yet.
        </p>
      </div>
    </main>
  );
}
