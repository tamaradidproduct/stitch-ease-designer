import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { DocMeta } from "../model/types";
import { chartStore } from "../storage/store";
import { importChart } from "../storage/exportImport";

const formatWhen = (iso: string) => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const days = Math.floor((Date.now() - date.getTime()) / 86_400_000);
  if (days === 0) return `today, ${date.toLocaleTimeString([], { timeStyle: "short" })}`;
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  return date.toLocaleDateString([], { dateStyle: "medium" });
};

export function ChartList() {
  const navigate = useNavigate();
  const [charts, setCharts] = useState<DocMeta[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);

  const refresh = useCallback(async () => {
    try {
      setCharts(await chartStore.list());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read your charts");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // `refreshAfter: false` for actions that navigate away from this list -
  // it's about to unmount, so re-fetching and setting state on the way out
  // is wasted work.
  const run = async (action: () => Promise<void>, { refreshAfter = true } = {}) => {
    try {
      setError(null);
      await action();
      if (refreshAfter) await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    }
  };

  const onNew = () =>
    run(
      async () => {
        const meta = await chartStore.create();
        navigate(`/c/${meta.id}`);
      },
      { refreshAfter: false },
    );

  const onImport = (file: File) =>
    run(
      async () => {
        const { name, placements } = await importChart(file);
        const meta = await chartStore.create(name);
        await chartStore.save(meta.id, placements, meta.rev);
        navigate(`/c/${meta.id}`);
      },
      { refreshAfter: false },
    );

  return (
    <div className="charts">
      <header className="charts__head">
        <h1 className="charts__title">My charts</h1>
        <div className="charts__actions">
          <button type="button" className="btn" onClick={() => fileInput.current?.click()}>
            Import
          </button>
          <button type="button" className="btn btn--primary" onClick={onNew}>
            New chart
          </button>
        </div>
      </header>

      <input
        ref={fileInput}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          // Reset first, so picking the same file twice in a row still fires.
          e.target.value = "";
          if (file) void onImport(file);
        }}
      />

      <p className="charts__note">
        Charts are saved in this browser only. Export anything you want to keep.
      </p>

      {error && <p className="charts__error">{error}</p>}

      {charts === null && <p className="charts__empty">Loading…</p>}

      {charts?.length === 0 && (
        <p className="charts__empty">No charts yet. Make one and start drawing.</p>
      )}

      <ul className="charts__list">
        {charts?.map((chart) => (
          <li key={chart.id} className="chartrow">
            {renaming === chart.id ? (
              <form
                className="chartrow__rename"
                onSubmit={(e) => {
                  e.preventDefault();
                  const name = new FormData(e.currentTarget).get("name");
                  setRenaming(null);
                  if (typeof name === "string" && name.trim() && name.trim() !== chart.name) {
                    void run(() => chartStore.rename(chart.id, name.trim()).then(() => {}));
                  }
                }}
              >
                <input
                  name="name"
                  className="chartrow__input"
                  defaultValue={chart.name}
                  autoFocus
                  onBlur={() => setRenaming(null)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") setRenaming(null);
                  }}
                />
              </form>
            ) : (
              <button
                type="button"
                className="chartrow__open"
                onClick={() => navigate(`/c/${chart.id}`)}
              >
                <span className="chartrow__name">{chart.name}</span>
                <span className="chartrow__when">{formatWhen(chart.updatedAt)}</span>
              </button>
            )}

            <div className="chartrow__tools">
              <button
                type="button"
                className="btn btn--quiet"
                onClick={() => setRenaming(chart.id)}
              >
                Rename
              </button>
              <button
                type="button"
                className="btn btn--quiet btn--danger"
                onClick={() => {
                  if (confirm(`Delete "${chart.name}"? This can't be undone.`)) {
                    void run(() => chartStore.remove(chart.id));
                  }
                }}
              >
                Delete
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
