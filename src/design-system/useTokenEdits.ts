import { useCallback, useEffect, useRef, useState } from "react";
import { getDb } from "./runtime";
import { cleanEdits, type Edits, tokenByName } from "./tokenModel";

const DRAFT_PATH = "drafts/current";
const LOCAL_KEY = "stitch-ease-design-draft";

export type DraftStore = "shared" | "browser";

/**
 * Token edits made on the page: applied live to :root so every component on
 * the page re-renders with them, and kept as a draft - in the artifact's
 * shared store when the viewer grants one (so a teammate opening the page
 * sees the same draft), else in this browser.
 */
export function useTokenEdits() {
  const [edits, setEdits] = useState<Edits>({});
  const [note, setNote] = useState("");
  const [store, setStore] = useState<DraftStore>("browser");
  const dbRef = useRef<Awaited<ReturnType<typeof getDb>>>(null);
  const lastWritten = useRef<string>("");
  // Never write the shared draft before reading it once, or a slow first
  // snapshot would be overwritten by this view's empty starting state.
  const hydrated = useRef(false);

  // Load: browser draft first, then the shared one if this view has a db.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LOCAL_KEY);
      if (raw) {
        const draft = JSON.parse(raw) as { edits?: Edits; note?: string };
        setEdits(cleanEdits(draft.edits ?? {}));
        setNote(draft.note ?? "");
      }
    } catch {
      // storage blocked or corrupt - start clean
    }
    let unsubscribe: (() => void) | undefined;
    let cancelled = false;
    void getDb().then((db) => {
      if (!db || cancelled) return;
      dbRef.current = db;
      setStore("shared");
      unsubscribe = db.doc(DRAFT_PATH).onSnapshot(
        (snap) => {
          hydrated.current = true;
          const data = snap.data();
          if (!data) return;
          const serialized = JSON.stringify({ edits: data.edits ?? {}, note: data.note ?? "" });
          if (serialized === lastWritten.current) return;
          lastWritten.current = serialized;
          setEdits(cleanEdits((data.edits as Edits) ?? {}));
          setNote(typeof data.note === "string" ? data.note : "");
        },
        () => setStore("browser"),
      );
    });
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  // Apply live to the page.
  useEffect(() => {
    const root = document.documentElement;
    for (const t of tokenByName.values()) {
      const value = edits[t.name];
      if (value === undefined) root.style.removeProperty(`--${t.name}`);
      else root.style.setProperty(`--${t.name}`, value);
    }
  }, [edits]);

  // Persist the draft (debounced), only when it actually changed.
  useEffect(() => {
    const serialized = JSON.stringify({ edits, note });
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(LOCAL_KEY, serialized);
      } catch {
        // storage blocked
      }
      const db = dbRef.current;
      if (db && hydrated.current && serialized !== lastWritten.current) {
        lastWritten.current = serialized;
        db.doc(DRAFT_PATH)
          .set({ edits, note, updatedAt: new Date().toISOString() })
          .catch(() => setStore("browser"));
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [edits, note]);

  const setToken = useCallback((name: string, value: string) => {
    setEdits((prev) => {
      const base = tokenByName.get(name)?.value;
      const next = { ...prev };
      if (value === base) delete next[name];
      else next[name] = value;
      return next;
    });
  }, []);

  const resetToken = useCallback((name: string) => {
    setEdits((prev) => {
      const next = { ...prev };
      delete next[name];
      return next;
    });
  }, []);

  const resetAll = useCallback(() => {
    setEdits({});
    setNote("");
  }, []);

  return { edits, note, setNote, setToken, resetToken, resetAll, store };
}
