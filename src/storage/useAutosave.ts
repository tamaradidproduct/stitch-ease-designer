import { useEffect, useRef } from "react";
import { useDocStore } from "../state/docStore";
import { ChartConflictError, StorageFullError, type DocStore } from "./DocStore";

const DEBOUNCE_MS = 800;

/**
 * Saves the open chart shortly after edits stop.
 *
 * Kept out of the zustand store deliberately: the store stays synchronous and
 * testable, and all the awkward parts of persistence — debouncing, in-flight
 * writes, conflicts, flushing before the tab goes away — live here.
 *
 * The revision being saved is captured before the write starts, so edits made
 * while it's in flight aren't wrongly marked saved; they just leave the chart
 * dirty again. An edit that lands *during* the write doesn't get its own
 * debounce timer re-armed by anything (the revision subscription already
 * fired for it once), so the in-flight save retries immediately on settling
 * if one landed - otherwise that edit would only get saved by coincidence,
 * whenever some later edit happens to schedule another pass.
 */
export function useAutosave(store: DocStore): void {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef(false);
  const missedWhileInFlight = useRef(false);

  useEffect(() => {
    const save = async () => {
      const { meta, index, revision, savedRevision, status } = useDocStore.getState();

      if (!meta || revision === savedRevision) return;
      // A conflict is unresolved until the user says otherwise; writing anyway
      // is exactly the clobber the rev check exists to prevent.
      if (status === "conflict") return;
      if (inFlight.current) {
        missedWhileInFlight.current = true;
        return;
      }

      inFlight.current = true;
      const saving = revision;
      useDocStore.getState().setStatus("saving");

      try {
        const next = await store.save(meta.id, index.toArray(), meta.rev);
        useDocStore.getState().markSaved(next, saving);
      } catch (error) {
        if (error instanceof ChartConflictError) {
          useDocStore
            .getState()
            .setStatus(
              "conflict",
              "This chart was changed in another tab. Reload to see that version — your unsaved edits here will be lost.",
            );
        } else if (error instanceof StorageFullError) {
          useDocStore
            .getState()
            .setStatus(
              "error",
              "Out of browser storage. Export a chart and delete it to free space.",
            );
        } else {
          useDocStore
            .getState()
            .setStatus("error", error instanceof Error ? error.message : "Could not save");
        }
      } finally {
        inFlight.current = false;
        if (missedWhileInFlight.current) {
          missedWhileInFlight.current = false;
          void save();
        }
      }
    };

    const schedule = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void save(), DEBOUNCE_MS);
    };

    const unsubscribe = useDocStore.subscribe((state, prev) => {
      if (state.revision !== prev.revision) schedule();
    });

    // Debouncing means there's almost always a pending write when a tab is
    // hidden or closed; without these, closing mid-edit loses the last second
    // of work. visibilitychange is the one that actually fires reliably on
    // mobile and on tab close in most browsers.
    const flush = () => {
      if (timer.current) clearTimeout(timer.current);
      void save();
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("beforeunload", flush);

    return () => {
      // Flush before tearing down, not after: leaving the editor almost always
      // happens inside the debounce window, and simply clearing the timer here
      // would drop the last edits on the way back to the chart list.
      flush();
      unsubscribe();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("beforeunload", flush);
    };
  }, [store]);
}
