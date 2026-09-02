import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { CanvasView } from "../canvas/CanvasView";
import { ChartNotFoundError } from "../storage/DocStore";
import { exportChart } from "../storage/exportImport";
import { chartStore } from "../storage/store";
import { useAutosave } from "../storage/useAutosave";
import { selectIsDirty, useDocStore } from "../state/docStore";
import { StatusBar } from "./StatusBar";
import { StitchPicker } from "./StitchPicker";
import { Toolbar } from "./Toolbar";

function SaveIndicator() {
  const status = useDocStore((s) => s.status);
  const detail = useDocStore((s) => s.statusDetail);
  const dirty = useDocStore(selectIsDirty);

  if (status === "conflict" || status === "error") {
    return (
      <span className="save save--bad" title={detail ?? undefined}>
        {status === "conflict" ? "Not saved — changed elsewhere" : "Not saved"}
      </span>
    );
  }
  if (status === "saving") return <span className="save">Saving…</span>;
  return <span className="save">{dirty ? "Unsaved changes" : "Saved"}</span>;
}

export function ChartEditor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [loadError, setLoadError] = useState<string | null>(null);

  const meta = useDocStore((s) => s.meta);
  const unknownSymbolIds = useDocStore((s) => s.unknownSymbolIds);
  const statusDetail = useDocStore((s) => s.statusDetail);
  const status = useDocStore((s) => s.status);

  useAutosave(chartStore);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    void (async () => {
      try {
        const loaded = await chartStore.load(id);
        // The route can change while a load is in flight; applying a stale
        // result would put the wrong chart on screen under the right URL.
        if (!cancelled) useDocStore.getState().openChart(loaded);
      } catch (error) {
        if (cancelled) return;
        if (error instanceof ChartNotFoundError) {
          navigate("/", { replace: true });
          return;
        }
        setLoadError(error instanceof Error ? error.message : "Could not open this chart");
      }
    })();

    return () => {
      cancelled = true;
    };
    // Deliberately not closing the chart on unmount: `openChart` replaces the
    // store wholesale, and clearing on the way out would race the autosave
    // flush, which would then write an emptied chart over a real one.
  }, [id, navigate]);

  if (loadError) {
    return (
      <div className="app app--message">
        <p className="charts__error">{loadError}</p>
        <Link className="btn" to="/">
          Back to my charts
        </Link>
      </div>
    );
  }

  // Bound rather than tested inline so it narrows: while a different chart is
  // still loading, `meta` is the previously open one and must not be shown.
  const openMeta = meta && meta.id === id ? meta : null;

  return (
    <div className="app">
      <header className="topbar">
        <Link className="topbar__back" to="/" title="All charts">
          ←
        </Link>
        {openMeta ? (
          <input
            className="topbar__name"
            defaultValue={openMeta.name}
            key={openMeta.id}
            aria-label="Chart name"
            onBlur={(e) => {
              const name = e.target.value.trim();
              if (!name || name === openMeta.name) {
                e.target.value = openMeta.name;
                return;
              }
              void chartStore
                .rename(openMeta.id, name)
                .then((next) => useDocStore.getState().setMeta(next));
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
              if (e.key === "Escape") {
                e.currentTarget.value = openMeta.name;
                e.currentTarget.blur();
              }
            }}
          />
        ) : (
          <span className="topbar__title">Opening…</span>
        )}
        <SaveIndicator />
        <span className="topbar__spacer" />
        <button
          type="button"
          className="btn btn--quiet"
          disabled={!openMeta}
          onClick={() => {
            const { index, meta: current } = useDocStore.getState();
            if (current) exportChart(current.name, index.toArray());
          }}
        >
          Export
        </button>
      </header>

      {(status === "conflict" || status === "error") && statusDetail && (
        <div className="banner banner--bad">
          <span>{statusDetail}</span>
          {status === "conflict" && (
            <button type="button" className="btn" onClick={() => window.location.reload()}>
              Reload
            </button>
          )}
        </div>
      )}

      {unknownSymbolIds.length > 0 && (
        <div className="banner">
          This chart uses {unknownSymbolIds.length} stitch
          {unknownSymbolIds.length === 1 ? "" : "es"} the library no longer has (
          {unknownSymbolIds.join(", ")}). They're drawn as single cells, which may be
          narrower than intended — check before knitting from it.
        </div>
      )}

      <Toolbar />
      <main className="stage">
        <CanvasView />
        <StitchPicker />
      </main>
      <StatusBar />
    </div>
  );
}
