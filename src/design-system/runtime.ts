/**
 * The published style guide runs inside the claude.ai artifact viewer, which
 * can grant it a shared document store (`db`) and the viewer's connectors
 * (`mcp`). Both are optional: opened anywhere else (a local file, `vite
 * preview`) every capability resolves null and the page falls back to
 * browser storage and a copy-the-request button.
 */

type Unsubscribe = () => void;

type DocSnapshot = { exists: boolean; data(): Record<string, unknown> | undefined };
type DocRef = {
  set(data: Record<string, unknown>): Promise<void>;
  onSnapshot(next: (snap: DocSnapshot) => void, error?: (e: unknown) => void): Unsubscribe;
};
type Db = { doc(path: string): DocRef };

export type McpError = { code: string; message: string };
type Mcp = {
  callTool(server: string, tool: string, input?: unknown): Promise<{ payload?: unknown }>;
};

type ClaudeRuntime = { use(name: string): Promise<unknown> };

function runtime(): ClaudeRuntime | null {
  return (window as unknown as { claude?: ClaudeRuntime }).claude ?? null;
}

async function capability<T>(name: string): Promise<T | null> {
  const claude = runtime();
  if (!claude) return null;
  try {
    return ((await claude.use(name)) as T | null) ?? null;
  } catch {
    return null;
  }
}

export const getDb = () => capability<Db>("db");
export const getMcp = () => capability<Mcp>("mcp");

/** The connector the "Apply to app" button calls, and the tool on it. */
export const REMOTE_SERVER = "Claude Code Remote";
export const REMOTE_TOOL = "create_session";

/** The Claude Code session link in a create_session result, if there is one. */
export function sessionUrlFrom(payload: unknown): string | null {
  try {
    const text = typeof payload === "string" ? payload : JSON.stringify(payload ?? "");
    const match = text.match(/session_[A-Za-z0-9]+/);
    return match ? `https://claude.ai/code/${match[0]}` : null;
  } catch {
    return null;
  }
}
