import { useState } from "react";
import { useDocStore } from "../state/docStore";
import { exportChartCsv } from "../storage/exportCsv";
import { type ImageFormat, exportChartImage } from "../storage/exportImage";
import { exportChart } from "../storage/exportImport";
import { Button } from "./Button";
import { useGlossaryIds } from "./chartGlossary";
import { Checkbox } from "./Field";
import { SideModule } from "./SideModule";

/** The right panel's collapsible export actions: Stitch Ease file, CSV, PNG, JPG. */
export function ExportSection() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [includeReferenceImage, setIncludeReferenceImage] = useState(true);
  const meta = useDocStore((state) => state.meta);
  const index = useDocStore((state) => state.index);
  const repeats = useDocStore((state) => state.repeats);
  const referenceImages = useDocStore((state) => state.referenceImages);
  const patternInfo = useDocStore((state) => state.patternInfo);
  const quickSymbolIds = useDocStore((state) => state.quickSymbolIds);
  const addedGlossaryIds = useGlossaryIds();

  return (
    <SideModule
      title="Export"
      subtitle="Share or save this pattern"
      collapsible={{ open, onToggle: () => setOpen((v) => !v) }}
    >
      {referenceImages.length > 0 && (
        <Checkbox
          labelClassName="refpanel__checkbox"
          checked={includeReferenceImage}
          onChange={(event) => setIncludeReferenceImage(event.target.checked)}
        >
          Include reference image{referenceImages.length > 1 ? "s" : ""}
        </Checkbox>
      )}
      <div className="refpanel__actions">
        <Button
          disabled={!meta}
          onClick={() => {
            if (meta) {
              void exportChart(
                meta.name,
                index.toArray(),
                repeats,
                referenceImages,
                addedGlossaryIds,
                quickSymbolIds,
                patternInfo,
                includeReferenceImage,
              );
            }
          }}
        >
          Stitch Ease file
        </Button>
        <Button
          disabled={!meta}
          onClick={() => {
            if (meta) exportChartCsv(meta.name, index.toArray());
          }}
        >
          CSV
        </Button>
        {(["png", "jpg"] as ImageFormat[]).map((format) => (
          <Button
            key={format}
            disabled={!meta || !!busy}
            onClick={() => {
              if (!meta) return;
              setError(null);
              setBusy(format);
              exportChartImage(meta.name, index.toArray(), format, repeats)
                .catch((e: unknown) => setError(e instanceof Error ? e.message : "Could not export the image"))
                .finally(() => setBusy(null));
            }}
          >
            {busy === format ? "Exporting…" : format.toUpperCase()}
          </Button>
        ))}
      </div>
      {error && <p className="refpanel__error">{error}</p>}
    </SideModule>
  );
}
