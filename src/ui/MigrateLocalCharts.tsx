import { useEffect, useState } from "react";
import type { DocMeta } from "../model/types";
import type { DocStore } from "../storage/DocStore";
import { migrateLocalCharts, type MigrationResult } from "../storage/migrateLocalCharts";
import { localChartStore } from "../storage/store";

type Phase =
  | { step: "checking" }
  | { step: "none" }
  | { step: "offer"; charts: DocMeta[] }
  | { step: "working" }
  | { step: "done"; result: MigrationResult }
  | { step: "error"; message: string };

/**
 * Shown once per sign-in, before the chart list, if this browser has charts
 * saved from before accounts existed.
 *
 * Skipping is safe either way: declining leaves the charts in browser storage
 * untouched, so nothing is lost, and this screen offers again next sign-in
 * rather than trying to remember a permanent dismissal — for an invite-only
 * handful of testers, re-asking is a smaller risk than silently orphaning
 * charts because a "don't ask again" flag then hid a real backlog.
 */
export function MigrateLocalCharts({
  targetStore,
  onDone,
}: {
  targetStore: DocStore;
  onDone: () => void;
}) {
  const [phase, setPhase] = useState<Phase>({ step: "checking" });

  useEffect(() => {
    let cancelled = false;
    void localChartStore
      .list()
      .then((charts) => {
        if (cancelled) return;
        setPhase(charts.length > 0 ? { step: "offer", charts } : { step: "none" });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setPhase({
          step: "error",
          message: error instanceof Error ? error.message : "Could not check browser storage",
        });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (phase.step === "none") onDone();
  }, [phase.step, onDone]);

  if (phase.step === "checking" || phase.step === "none") return null;

  if (phase.step === "offer") {
    const { charts } = phase;
    return (
      <div className="signIn">
        <div className="signIn__card">
          <h1 className="signIn__title">Bring your charts along?</h1>
          <p className="signIn__sent">
            This browser has {charts.length} chart{charts.length === 1 ? "" : "s"} saved from
            before you signed in:
          </p>
          <ul className="charts__list">
            {charts.map((c) => (
              <li key={c.id} className="chartrow">
                <span className="chartrow__name">{c.name}</span>
              </li>
            ))}
          </ul>
          <div className="signIn__form signIn__form--actions">
            <button
              type="button"
              onClick={() => {
                setPhase({ step: "working" });
                void migrateLocalCharts(localChartStore, targetStore)
                  .then((result) => setPhase({ step: "done", result }))
                  .catch((error: unknown) =>
                    setPhase({
                      step: "error",
                      message: error instanceof Error ? error.message : "Could not copy charts",
                    }),
                  );
              }}
            >
              Add to my account
            </button>
            <button type="button" className="btn btn--quiet" onClick={onDone}>
              Not now
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (phase.step === "working") {
    return (
      <div className="signIn">
        <div className="signIn__card">
          <p className="signIn__sent">Copying your charts…</p>
        </div>
      </div>
    );
  }

  if (phase.step === "error") {
    return (
      <div className="signIn">
        <div className="signIn__card">
          <h1 className="signIn__title">Couldn’t check your local charts</h1>
          <p className="signIn__error">{phase.message}</p>
          <p className="signIn__sent">Your browser charts have not been changed.</p>
          <div className="signIn__form signIn__form--actions">
            <button type="button" onClick={onDone}>
              Continue
            </button>
          </div>
        </div>
      </div>
    );
  }

  const { result } = phase;
  return (
    <div className="signIn">
      <div className="signIn__card">
        <h1 className="signIn__title">Done</h1>
        {result.migrated.length > 0 && (
          <p className="signIn__sent">Added: {result.migrated.join(", ")}.</p>
        )}
        {result.failed.length > 0 && (
          <p className="signIn__error">
            Couldn't add {result.failed.map((f) => f.name).join(", ")} — still saved in this
            browser, try again later.
          </p>
        )}
        <div className="signIn__form signIn__form--actions">
          <button type="button" onClick={onDone}>
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}
