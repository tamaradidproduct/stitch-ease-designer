import { useMemo, useState } from "react";
import { Button } from "../ui/Button";
import { CloseIcon, SearchIcon } from "../ui/icons";
import { getMcp, REMOTE_SERVER, REMOTE_TOOL, type McpError } from "./runtime";
import {
  changeRequestPrompt,
  cleanEdits,
  type Edits,
  groups,
  invalidReason,
  isHex,
  toHex6,
  tokenByName,
  type TokenDef,
} from "./tokenModel";
import type { DraftStore } from "./useTokenEdits";

const REPO_URL = "https://github.com/tamaradidproduct/stitch-ease-designer";
const ENVIRONMENT_ID = "env_01Uyh1PZ1rszzRdjnGGzsm5D";
export const ARTIFACT_URL = "https://claude.ai/artifact/TmZLgB2yyqdgXQX2Qyb3S6";

type ApplyState =
  | { kind: "idle" }
  | { kind: "working" }
  | { kind: "done"; sessionUrl: string | null }
  | { kind: "error"; message: string };

function errorCopy(e: McpError | undefined): string {
  switch (e?.code) {
    case "server_not_connected":
    case "server_not_found":
      return `Add the ${REMOTE_SERVER} connector in claude.ai Settings → Connectors, then try again. Or copy the request below and paste it into Claude Code.`;
    case "needs_reauth":
      return `Reconnect ${REMOTE_SERVER} in claude.ai Settings → Connectors, then try again.`;
    case "not_in_manifest":
    case "not_granted":
      return `This page isn't allowed to use ${REMOTE_SERVER} for you. Allow it from the page's Permissions menu, or copy the request below.`;
    case "blocked_by_policy":
    case "approval_required":
      return "Your organization's policy blocks starting sessions from this page. Copy the request below and paste it into Claude Code.";
    case "server_unavailable":
    case "upstream_error":
      return "Claude Code didn't answer. Check claude.ai/code before trying again, since a session may already have started.";
    case "tool_error":
      return `Claude Code refused the request: ${e.message}`;
    default:
      return e?.message ? `Couldn't start the session: ${e.message}` : "Couldn't start the session.";
  }
}

function sessionUrlFrom(payload: unknown): string | null {
  const text = typeof payload === "string" ? payload : JSON.stringify(payload ?? "");
  const match = text.match(/session_[A-Za-z0-9]+/);
  return match ? `https://claude.ai/code/${match[0]}` : null;
}

function TokenInput({ token, value, onChange, onReset }: { token: TokenDef; value: string; onChange: (v: string) => void; onReset: () => void }) {
  const changed = value !== token.value;
  const problem = invalidReason(value);
  const id = `tok-${token.name}`;
  return (
    <div className="ds-edit__row" data-changed={changed}>
      <label htmlFor={id} className="ds-edit__name">
        <code>--{token.name}</code>
        {token.description && <span>{token.description}</span>}
      </label>
      <div className="ds-edit__inputs">
        {token.type === "color" && (
          isHex(value) ? (
            <input
              type="color"
              aria-label={`Pick --${token.name}`}
              value={toHex6(value)}
              onChange={(e) => onChange(e.target.value)}
            />
          ) : (
            <span className="ds-edit__swatch" style={{ background: value }} aria-hidden="true" />
          )
        )}
        <input
          id={id}
          className="ds-input ds-edit__text"
          value={value}
          spellCheck={false}
          aria-invalid={problem ? true : undefined}
          onChange={(e) => onChange(e.target.value)}
        />
        <Button variant="quiet" size="sm" disabled={!changed} onClick={onReset} title={`Reset to ${token.value}`}>
          Reset
        </Button>
      </div>
      {problem && <p className="ds-edit__error">{problem}</p>}
      {changed && !problem && <p className="ds-edit__was">Was <code>{token.value}</code></p>}
    </div>
  );
}

export function EditorPanel({
  edits,
  note,
  setNote,
  setToken,
  resetToken,
  resetAll,
  store,
  focusToken,
  onClose,
}: {
  edits: Edits;
  note: string;
  setNote: (v: string) => void;
  setToken: (name: string, value: string) => void;
  resetToken: (name: string) => void;
  resetAll: () => void;
  store: DraftStore;
  focusToken: string | null;
  onClose: () => void;
}) {
  const [query, setQuery] = useState(focusToken ?? "");
  const [apply, setApply] = useState<ApplyState>({ kind: "idle" });
  const valid = useMemo(() => cleanEdits(edits), [edits]);
  const changedCount = Object.keys(valid).length;
  const hasInvalid = Object.values(edits).some((v) => invalidReason(v));
  const prompt = changeRequestPrompt(valid, note, ARTIFACT_URL);
  const q = query.trim().toLowerCase();

  const onApply = async () => {
    setApply({ kind: "working" });
    const mcp = await getMcp();
    if (!mcp) {
      setApply({ kind: "error", message: "This view can't reach Claude Code (it only works inside claude.ai). Copy the request below and paste it into Claude Code." });
      return;
    }
    try {
      const result = await mcp.callTool(REMOTE_SERVER, REMOTE_TOOL, {
        prompt,
        source_url: REPO_URL,
        environment_id: ENVIRONMENT_ID,
        title: `Design tokens: ${changedCount} change${changedCount === 1 ? "" : "s"}${note.trim() ? " + notes" : ""}`,
      });
      setApply({ kind: "done", sessionUrl: sessionUrlFrom(result.payload) });
    } catch (e) {
      setApply({ kind: "error", message: errorCopy(e as McpError) });
    }
  };

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      setApply((s) => (s.kind === "error" ? { kind: "error", message: `${s.message} (Request copied.)` } : s));
    } catch {
      const el = document.getElementById("ds-prompt") as HTMLTextAreaElement | null;
      el?.select();
    }
  };

  return (
    <aside className="ds-edit" aria-label="Edit tokens">
      <header className="ds-edit__head">
        <div>
          <h2>Edit tokens</h2>
          <p>
            Changes preview live on this page. The draft is saved {store === "shared" ? "for everyone who can edit this page" : "in this browser"}.
          </p>
        </div>
        <button type="button" className="ds-edit__close" aria-label="Close editor" onClick={onClose}>
          <CloseIcon width={16} height={16} strokeWidth={1.6} />
        </button>
      </header>

      <section className="ds-edit__apply">
        <div className="ds-edit__applyHead">
          <b>{changedCount ? `${changedCount} change${changedCount === 1 ? "" : "s"}` : "No changes yet"}</b>
          <Button variant="quiet" size="sm" danger disabled={!changedCount && !note} onClick={resetAll}>
            Discard all
          </Button>
        </div>
        {changedCount > 0 && (
          <ul className="ds-edit__diff">
            {Object.entries(valid).map(([name, value]) => (
              <li key={name}>
                <code>--{name}</code> <span>{tokenByName.get(name)?.value}</span> → <b>{value}</b>
                <button type="button" onClick={() => resetToken(name)} aria-label={`Undo --${name}`}>
                  Undo
                </button>
              </li>
            ))}
          </ul>
        )}
        <label className="ds-field" htmlFor="ds-note">
          <span>Other changes (components, layout, copy)</span>
        </label>
        <textarea
          id="ds-note"
          className="ds-input ds-edit__note"
          placeholder="e.g. Make glossary rows 40px tall. Use primary buttons in the export section."
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <Button
          variant="primary"
          size="lg"
          className="ds-edit__applyBtn"
          disabled={(!changedCount && !note.trim()) || hasInvalid || apply.kind === "working"}
          onClick={() => void onApply()}
        >
          {apply.kind === "working" ? "Starting Claude Code…" : "Apply to app"}
        </Button>
        <p className="ds-note">
          Starts a Claude Code session that updates <code>tokens.json</code>, regenerates the CSS, canvas colors and this page, and opens a pull request for you to review. Nothing merges on its own.
        </p>
        {hasInvalid && <p className="ds-edit__error">Fix the highlighted values before applying.</p>}
        {apply.kind === "done" && (
          <p className="ds-edit__ok" role="status">
            Claude Code is working on it.{" "}
            {apply.sessionUrl ? (
              <a href={apply.sessionUrl} target="_blank" rel="noreferrer">
                Follow the session
              </a>
            ) : (
              <>Find it at <a href="https://claude.ai/code" target="_blank" rel="noreferrer">claude.ai/code</a>.</>
            )}{" "}
            It will open a pull request when it's done.
          </p>
        )}
        {apply.kind === "error" && (
          <p className="ds-edit__error" role="alert">
            {apply.message}
          </p>
        )}
        <details className="ds-edit__prompt">
          <summary>See the request Claude Code will get</summary>
          <textarea id="ds-prompt" className="ds-input" readOnly value={prompt} />
          <Button size="sm" onClick={() => void copyPrompt()}>
            Copy request
          </Button>
        </details>
      </section>

      <div className="ds-edit__search">
        <SearchIcon width={16} height={16} strokeWidth={1.6} />
        <input
          className="ds-input"
          placeholder="Find a token…"
          aria-label="Find a token"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div className="ds-edit__groups">
        {groups.map((g) => {
          const tokens = g.tokens.filter((t) => !q || t.name.includes(q) || t.description.toLowerCase().includes(q));
          if (!tokens.length) return null;
          return (
            <section key={g.id} className="ds-edit__group">
              <h3>{g.label}</h3>
              {tokens.map((t) => (
                <TokenInput
                  key={t.name}
                  token={t}
                  value={edits[t.name] ?? t.value}
                  onChange={(v) => setToken(t.name, v)}
                  onReset={() => resetToken(t.name)}
                />
              ))}
            </section>
          );
        })}
      </div>
    </aside>
  );
}
