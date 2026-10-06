import { Component, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { COLOR_GRID } from "../model/colorPalette";
import { useUiStore, SUGGEST_SYMBOL_ID } from "../state/uiStore";
import { allSymbols, getSymbol } from "../symbols/registry";
import { Button, IconButton } from "../ui/Button";
import { ColorChip } from "../ui/ColorChip";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import * as Icons from "../ui/icons";
import { MotifCellGlyph, MotifGlyph } from "../ui/motifUi";
import { Checkbox, Slider, TextField } from "../ui/Field";
import { Popover } from "../ui/Popover";
import { QuickTile } from "../ui/QuickTile";
import { RightPanel } from "../ui/RightPanel";
import { SegmentedControl } from "../ui/SegmentedControl";
import { SideModule } from "../ui/SideModule";
import { StatusBar } from "../ui/StatusBar";
import { SymbolGlyph } from "../ui/SymbolGlyph";
import { Toolbar } from "../ui/Toolbar";
import { useDismissOnOutsideOrEscape } from "../ui/useDismissOnOutsideOrEscape";
import type { ButtonSize, ButtonVariant } from "../ui/buttonClassName";
import { EditorPanel } from "./EditorPanel";
import { backlog, type BacklogItem } from "./audit";
import { geometry } from "./geometry";
import { groups, type TokenGroup } from "./tokenModel";
import { useTokenEdits } from "./useTokenEdits";

const cursorAssets = import.meta.glob<string>("../canvas/assets/cursors/*", { eager: true, import: "default", query: "?url" });

class Boundary extends Component<{ name: string; children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return <p className="ds-note">{this.props.name} couldn't render here: {this.state.error.message}</p>;
    }
    return this.props.children;
  }
}

function Section({ id, title, lede, children }: { id: string; title: string; lede?: ReactNode; children: ReactNode }) {
  return (
    <section className="ds-section" id={id}>
      <header>
        <h2>{title}</h2>
        {lede && <p className="ds-lede">{lede}</p>}
      </header>
      {children}
    </section>
  );
}

function Seg<T extends string>({ label, options, value, onChange }: { label: string; options: readonly T[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="ds-field">
      <span>{label}</span>
      <div className="ds-seg" role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <Button key={o} size="sm" role="radio" aria-checked={o === value} on={o === value} onClick={() => onChange(o)}>
            {o || "none"}
          </Button>
        ))}
      </div>
    </div>
  );
}

function useCopy() {
  const [toast, setToast] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const copy = (text: string) => {
    const show = (msg: string) => {
      setToast(msg);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setToast(null), 1600);
    };
    navigator.clipboard.writeText(text).then(
      () => show(`Copied ${text}`),
      () => show(`Copy is blocked here: ${text}`),
    );
  };
  return { toast, copy };
}

/* ------------------------------------------------------------------ tokens */

function TokenValue({ name, edits }: { name: string; edits: Record<string, string> }) {
  const base = groups.flatMap((g) => g.tokens).find((t) => t.name === name)!;
  const changed = edits[name] !== undefined;
  return (
    <span className="ds-swatch__val">
      {edits[name] ?? base.value}
      {changed && <em className="ds-changed"> edited</em>}
    </span>
  );
}

function ColorGroup({ group, edits, onEdit }: { group: TokenGroup; edits: Record<string, string>; onEdit: (n: string) => void }) {
  return (
    <>
      <div className="ds-group-title">{group.label}</div>
      <div className="ds-swatches">
        {group.tokens.map((t) => (
          <button key={t.name} type="button" className="ds-swatch" onClick={() => onEdit(t.name)} title={`Edit --${t.name}`}>
            <span className="ds-swatch__chip">
              <i style={{ background: `var(--${t.name})` }} />
            </span>
            <span className="ds-swatch__text">
              <span className="ds-swatch__name">--{t.name}</span>
              <TokenValue name={t.name} edits={edits} />
              {t.description && <span className="ds-swatch__note">{t.description}</span>}
            </span>
          </button>
        ))}
      </div>
    </>
  );
}

function RowList({ group, edits, onEdit, render }: { group: TokenGroup; edits: Record<string, string>; onEdit: (n: string) => void; render: (name: string) => ReactNode }) {
  return (
    <div className="ds-panel">
      <div className="ds-rows">
        {group.tokens.map((t) => (
          <div key={t.name} className="ds-row">
            <button type="button" className="ds-row__meta" onClick={() => onEdit(t.name)} title={`Edit --${t.name}`}>
              <b>--{t.name}</b>
              <TokenValue name={t.name} edits={edits} />
              {t.description && <span>{t.description}</span>}
            </button>
            <div className="ds-row__demo">{render(t.name)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

const byId = (id: string) => groups.find((g) => g.id === id)!;

function TokenSections({ edits, onEdit }: { edits: Record<string, string>; onEdit: (n: string) => void }) {
  const [sample, setSample] = useState("K2tog, yo, ssk · row 12 (RS) · Cable 2/2 left");
  const colorGroups = groups.filter((g) => g.type === "color");
  return (
    <>
      <Section id="color" title="Color" lede="Click any swatch to edit it. Every color in the app, the chart canvas included, comes from these tokens.">
        <div className="ds-stack">
          {colorGroups.map((g) => (
            <ColorGroup key={g.id} group={g} edits={edits} onEdit={onEdit} />
          ))}
        </div>
      </Section>

      <Section id="type" title="Typography" lede="One family, seven sizes, three weights. Type your own sample to see it at every size.">
        <div className="ds-panel">
          <div className="ds-controls">
            <label className="ds-field" style={{ flex: "1 1 260px" }}>
              <span>Sample text</span>
              <input className="ds-input" value={sample} onChange={(e) => setSample(e.target.value)} />
            </label>
          </div>
        </div>
        <RowList
          group={{ ...byId("font"), tokens: byId("font").tokens.filter((t) => t.name.startsWith("font-size")) }}
          edits={edits}
          onEdit={onEdit}
          render={(n) => <p className="ds-type-sample" style={{ fontSize: `var(--${n})` }}>{sample}</p>}
        />
        <RowList
          group={{ ...byId("font"), tokens: byId("font").tokens.filter((t) => !t.name.startsWith("font-size")) }}
          edits={edits}
          onEdit={onEdit}
          render={(n) =>
            n === "font-sans" ? (
              <p className="ds-type-sample" style={{ fontFamily: "var(--font-sans)" }}>{sample}</p>
            ) : n.startsWith("leading") ? (
              <p className="ds-type-sample ds-leading-demo" style={{ lineHeight: `var(--${n})` }}>{sample} · {sample}</p>
            ) : n.startsWith("tracking") ? (
              <p className="ds-type-sample" style={{ letterSpacing: `var(--${n})`, textTransform: n === "tracking-wide" ? "uppercase" : "none" }}>{sample}</p>
            ) : (
              <p className="ds-type-sample" style={{ fontWeight: `var(--${n})` as unknown as number }}>{sample}</p>
            )
          }
        />
      </Section>

      <Section id="spacing" title="Spacing" lede="For gap, padding, margin and edge offsets.">
        <RowList group={byId("space")} edits={edits} onEdit={onEdit} render={(n) => <div className="ds-bar" style={{ width: `calc(var(--${n}) * 6)` }} />} />
      </Section>

      <Section id="radius" title="Radius & border">
        <RowList group={byId("radius")} edits={edits} onEdit={onEdit} render={(n) => <div className="ds-radius-demo" style={{ borderRadius: `var(--${n})` }} />} />
        <RowList
          group={byId("border")}
          edits={edits}
          onEdit={onEdit}
          render={(n) => <div className="ds-border-demo" style={{ borderWidth: `var(--${n})` }} />}
        />
      </Section>

      <Section id="size" title="Icon, control & layout size">
        <RowList
          group={byId("size")}
          edits={edits}
          onEdit={onEdit}
          render={(n) =>
            n.startsWith("icon") ? (
              <span className="ds-icon-demo" style={{ width: `var(--${n})`, height: `var(--${n})` }}>
                <Icons.DrawIcon />
              </span>
            ) : (
              <span className="ds-control-demo" style={{ height: `var(--${n})` }}>
                {["control-sm", "control-md", "control-lg"].includes(n) ? (
                  <Button size={n.replace("control-", "") as ButtonSize}>Button size="{n.replace("control-", "")}"</Button>
                ) : (
                  <span className="ds-control-box" style={{ height: `var(--${n})`, minWidth: `var(--${n})` }} />
                )}
              </span>
            )
          }
        />
        <RowList group={byId("layout")} edits={edits} onEdit={onEdit} render={(n) => <div className="ds-bar" style={{ width: `min(100%, calc(var(--${n}) / 2))` }} />} />
      </Section>

      <Section id="state" title="Interaction state" lede="One disabled look and one keyboard focus ring for every control. Tab onto the buttons to see the ring.">
        <RowList
          group={byId("state")}
          edits={edits}
          onEdit={onEdit}
          render={(n) =>
            n === "opacity-disabled" ? (
              <span className="ds-seg">
                <Button disabled>Disabled</Button>
                <Button variant="primary" disabled>Disabled</Button>
              </span>
            ) : (
              <span className="ds-focus-demo">Focused</span>
            )
          }
        />
      </Section>

      <Section id="elevation" title="Elevation">
        <div className="ds-elev-grid">
          {byId("shadow").tokens.filter((t) => t.name.startsWith("shadow")).map((t) => (
            <button key={t.name} type="button" className="ds-elev" style={{ boxShadow: `var(--${t.name})` }} onClick={() => onEdit(t.name)}>
              <b>--{t.name}</b>
              <span>{t.description}</span>
            </button>
          ))}
          <button type="button" className="ds-elev ds-elev--glass" onClick={() => onEdit("blur-glass")}>
            <b>--surface-glass + --blur-glass</b>
            <span>Floating docks</span>
          </button>
        </div>
      </Section>

      <Section id="layers" title="Layers" lede="App-level stacking, highest first. 1–6 inside a component is local stacking.">
        <RowList
          group={{ ...byId("z"), tokens: [...byId("z").tokens].reverse() }}
          edits={edits}
          onEdit={onEdit}
          render={(n) => <span className="ds-layer-demo">z-index: var(--{n})</span>}
        />
      </Section>

      <Section id="motion" title="Motion" lede="With the OS “reduce motion” setting on, the app drops all transitions.">
        <MotionDemo />
      </Section>
    </>
  );
}

function MotionDemo() {
  const [on, setOn] = useState(false);
  return (
    <div className="ds-panel">
      <div className="ds-motion">
        {["duration-fast", "duration-base"].map((d) => (
          <div key={d} className="ds-track" data-on={on}>
            <span className="ds-track__label">--{d}</span>
            <div className="ds-puck" style={{ transition: `left var(--${d}) var(--ease-standard)` }} />
          </div>
        ))}
      </div>
      <div className="ds-snippet">
        <Button variant="primary" size="sm" onClick={() => setOn((v) => !v)}>
          Play
        </Button>
        <pre>transition: left var(--duration-*) var(--ease-standard)</pre>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------- components */

function ButtonPlayground() {
  const [variant, setVariant] = useState<ButtonVariant>("primary");
  const [size, setSize] = useState<"" | ButtonSize>("");
  const [danger, setDanger] = useState(false);
  const [on, setOn] = useState(false);
  const [disabled, setDisabled] = useState(false);
  const [label, setLabel] = useState("New chart");
  const props = [variant !== "default" && `variant="${variant}"`, danger && "danger", size && `size="${size}"`, on && "on", disabled && "disabled"].filter(Boolean);
  return (
    <div className="ds-panel">
      <div className="ds-stage ds-stage--center">
        <Button variant={variant} danger={danger} size={size || undefined} on={on || undefined} disabled={disabled}>
          {label || "Button"}
        </Button>
      </div>
      <div className="ds-controls">
        <Seg label="Variant" options={["default", "primary", "quiet"] as const} value={variant} onChange={setVariant} />
        <Seg label="Size" options={["", "sm", "md", "lg"] as const} value={size} onChange={setSize} />
        <div className="ds-field">
          <span>State</span>
          <div className="ds-seg">
            <label className="ds-check"><input type="checkbox" checked={danger} onChange={(e) => setDanger(e.target.checked)} /> danger</label>
            <label className="ds-check"><input type="checkbox" checked={on} onChange={(e) => setOn(e.target.checked)} /> on</label>
            <label className="ds-check"><input type="checkbox" checked={disabled} onChange={(e) => setDisabled(e.target.checked)} /> disabled</label>
          </div>
        </div>
        <label className="ds-field" style={{ flex: "1 1 160px" }}>
          <span>Label</span>
          <input className="ds-input" value={label} onChange={(e) => setLabel(e.target.value)} />
        </label>
      </div>
      <div className="ds-snippet">
        <pre>{`<Button${props.length ? " " + props.join(" ") : ""}>${label}</Button>`}</pre>
      </div>
    </div>
  );
}

function IconButtons() {
  const [visible, setVisible] = useState(true);
  const [opacity, setOpacity] = useState(false);
  const [front, setFront] = useState(false);
  return (
    <div className="ds-panel">
      <div className="ds-stage">
        <IconButton className="refpanel__iconButton" label="Edit image 1" tooltip="Edit">
          <Icons.EditIcon />
        </IconButton>
        <IconButton className="refpanel__iconButton" label={visible ? "Hide image 1" : "Show image 1"} tooltip={visible ? "Hide" : "Show"} aria-pressed={!visible} onClick={() => setVisible((v) => !v)}>
          {visible ? <Icons.EyeSmallIcon /> : <Icons.EyeOffSmallIcon />}
        </IconButton>
        <IconButton className="refpanel__iconButton" label="Adjust opacity" tooltip="Opacity" aria-expanded={opacity} onClick={() => setOpacity((v) => !v)}>
          <Icons.OpacityIcon />
        </IconButton>
        <IconButton className="refpanel__iconButton refpanel__layerButton" label={front ? "Send reference images behind stitches" : "Bring reference images in front of stitches"} aria-pressed={front} onClick={() => setFront((v) => !v)}>
          {front ? <Icons.SendBehindSmallIcon /> : <Icons.BringFrontSmallIcon />}
          <span>{front ? "Send behind" : "Bring to front"}</span>
        </IconButton>
      </div>
      <div className="ds-snippet"><pre>{`<IconButton label="Hide image 1" tooltip="Hide" aria-pressed={!visible}>…</IconButton>`}</pre></div>
    </div>
  );
}

function PopoverDemo() {
  const [open, setOpen] = useState(false);
  const [last, setLast] = useState("Choose an action.");
  const ref = useRef<HTMLDivElement | null>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  useDismissOnOutsideOrEscape({
    onDismiss: () => setOpen(false),
    containerRef: ref,
    enabled: open,
    ignoreTarget: (target) => target instanceof Node && !!trigger.current?.contains(target),
  });
  const items = ["Rename", "Move to quick slot 1", "Select every placement"];
  return (
    <div className="ds-panel">
      <div className="ds-stage" style={{ minHeight: 210, alignItems: "flex-start" }}>
        <span className="ds-anchor">
          <Button ref={trigger} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
            <Icons.MoreIcon width={16} height={16} /> More actions
          </Button>
          {open && (
            <Popover ref={ref} className="glossary__menu ds-pop-abs" role="menu">
              {items.map((i) => (
                <button key={i} type="button" role="menuitem" onClick={() => { setLast(`Chose “${i}”.`); setOpen(false); }}>
                  {i}
                </button>
              ))}
              <button type="button" role="menuitem" disabled>
                Remove from chart<small>Still placed 12 times</small>
              </button>
            </Popover>
          )}
        </span>
        <span className="ds-note">{last}</span>
      </div>
      <div className="ds-snippet"><pre>{`<Popover className="glossary__menu" role="menu">…</Popover>`}</pre></div>
    </div>
  );
}

function DialogDemo() {
  const [kind, setKind] = useState<null | "chart" | "motif">(null);
  const [result, setResult] = useState("No choice made yet.");
  const done = (r: string) => { setResult(r); setKind(null); };
  return (
    <div className="ds-panel">
      <div className="ds-stage">
        <Button variant="quiet" danger onClick={() => setKind("chart")}>Delete chart</Button>
        <Button onClick={() => setKind("motif")}>Delete motif with copies</Button>
        <span className="ds-note">{result}</span>
      </div>
      {kind === "chart" && (
        <ConfirmDialog message="Delete “Aran yoke”? This can't be undone." onConfirm={() => done("Deleted (demo only).")} onCancel={() => done("Kept the chart.")} />
      )}
      {kind === "motif" && (
        <ConfirmDialog
          message="“Honeycomb” has 3 copies on this chart. What should happen to them?"
          confirmLabel="Delete copies"
          extraActions={[{ label: "Detach copies", onClick: () => done("Detached 3 copies (demo only).") }]}
          onConfirm={() => done("Deleted motif and copies (demo only).")}
          onCancel={() => done("Kept the motif.")}
        />
      )}
      <div className="ds-snippet"><pre>{`<ConfirmDialog message="Delete “Aran yoke”?" onConfirm={…} onCancel={…} />`}</pre></div>
    </div>
  );
}

function SegmentedDemo() {
  const [worked, setWorked] = useState<"flat" | "round">("flat");
  const [corner, setCorner] = useState<"tl" | "tr" | "bl" | "br">("br");
  return (
    <div className="ds-panel">
      <div className="ds-stage" style={{ gap: 32 }}>
        <div style={{ width: 200 }}>
          <SegmentedControl
            label="Worked flat or in the round"
            options={[
              { value: "flat", children: "Flat" },
              { value: "round", children: "Round" },
            ]}
            value={worked}
            onChange={setWorked}
          />
        </div>
        <SegmentedControl
          label="Which corner the first stitch is at"
          appearance="custom"
          className="patternInfo__corners"
          options={(["tl", "tr", "bl", "br"] as const).map((c) => ({ value: c, label: `Corner ${c}` }))}
          value={corner}
          onChange={setCorner}
        />
        <span className="ds-note">Arrow keys move the choice. Only the chosen option is a tab stop.</span>
      </div>
      <div className="ds-snippet"><pre>{`<SegmentedControl label="Worked" options={[…]} value={worked} onChange={setWorked} />`}</pre></div>
    </div>
  );
}

function FieldsDemo() {
  const [title, setTitle] = useState("Aran yoke");
  const [opacity, setOpacity] = useState(0.5);
  const [crop, setCrop] = useState(true);
  return (
    <div className="ds-panel">
      <div className="ds-stage" style={{ alignItems: "flex-start", gap: 28 }}>
        <label className="ds-field"><span>default</span><TextField placeholder="Name this color" /></label>
        <label className="ds-field"><span>inline</span><TextField variant="inline" className="topbar__name" value={title} onChange={(e) => setTitle(e.target.value)} /></label>
        <label className="ds-field"><span>rename</span><TextField variant="rename" defaultValue="Honeycomb" /></label>
        <label className="ds-field" style={{ minWidth: 180 }}><span>Slider · {Math.round(opacity * 100)}%</span><Slider min={0.1} max={1} step={0.05} value={opacity} onChange={(e) => setOpacity(Number(e.target.value))} /></label>
        <div className="ds-field"><span>Checkbox</span><Checkbox checked={crop} onChange={(e) => setCrop(e.target.checked)}>Crop to calibrated stitches</Checkbox></div>
      </div>
      <div className="ds-snippet"><pre>{`<TextField variant="rename" … />  <Slider min={0} max={1} … />  <Checkbox checked={…}>Label</Checkbox>`}</pre></div>
    </div>
  );
}

function SideModuleDemo() {
  const [open, setOpen] = useState(true);
  return (
    <div className="ds-panel">
      <div className="ds-stage" style={{ alignItems: "flex-start" }}>
        <div style={{ width: 300, display: "grid", gap: 10 }}>
          <SideModule title="Help" subtitle="Keyboard shortcuts" collapsible={{ open, onToggle: () => setOpen((v) => !v) }}>
            <div className="inset">An .inset box: a quiet panel inside the flow, with no shadow.</div>
          </SideModule>
          <SideModule title="Navigator" subtitle="Move around the canvas" actions={<Button size="sm">Center</Button>} />
        </div>
      </div>
      <div className="ds-snippet"><pre>{`<SideModule title="Help" subtitle="Keyboard shortcuts" collapsible={{ open, onToggle }}>…</SideModule>`}</pre></div>
    </div>
  );
}

function ColorChipDemo() {
  const [color, setColor] = useState<string | null>(null);
  const k2tog = getSymbol("k2tog")!;
  return (
    <div className="ds-panel">
      <div className="ds-stage" style={{ minHeight: 190, alignItems: "flex-start", gap: 28 }}>
        <span className="ds-tile">
          <SymbolGlyph symbol={k2tog} colorId={color} />
          <ColorChip label="Color k2tog" onSelect={setColor} />
        </span>
        <span className="ds-note">{color ? <>Colored <code>{color}</code></> : "Uncolored"}</span>
      </div>
      <div className="ds-snippet"><pre>{`<ColorChip label="Color k2tog" onSelect={(colorId) => applyChipColor(…)} />`}</pre></div>
    </div>
  );
}

function QuickTiles() {
  const [active, setActive] = useState("knit");
  const ids = ["knit", "purl", "k2tog", "ssk_alt", "yarn_over"];
  return (
    <div className="ds-panel">
      <div className="ds-stage">
        <div className="picker__quick ds-quick" role="radiogroup" aria-label="Quick stitches">
          {ids.map((id) => {
            const symbol = getSymbol(id);
            if (!symbol) return null;
            return (
              <QuickTile
                key={id}
                entry={{ key: id, symbol }}
                active={active === id}
                onChoose={() => setActive(id)}
                onChooseColor={() => {}}
                getPopoverBoundaryRect={() => null}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ToolDockDemo() {
  const suggestArmed = useUiStore((s) => s.armedSymbolId === SUGGEST_SYMBOL_ID);
  return (
    <div className="ds-panel">
      <div className="ds-stage ds-stage--center ds-dock-demo">
        <Toolbar />
      </div>
      <div className="ds-controls">
        <label className="ds-check">
          <input
            type="checkbox"
            checked={suggestArmed}
            onChange={(e) => useUiStore.setState({ armedSymbolId: e.target.checked ? SUGGEST_SYMBOL_ID : null, tool: "stitch" })}
          />{" "}
          Suggest mode armed
        </label>
        <span className="ds-note">This is the app's real tool dock, wired to the real editor state.</span>
      </div>
    </div>
  );
}

function Glyphs() {
  const cats = useMemo(() => ["all", ...new Set(allSymbols().map((s) => s.category))], []);
  const [cat, setCat] = useState("all");
  const [pen, setPen] = useState<string>("");
  const [q, setQ] = useState("");
  const pens = ["", COLOR_GRID[1]!.id, COLOR_GRID[5]!.id, COLOR_GRID[17]!.id, COLOR_GRID[22]!.id, COLOR_GRID[27]!.id];
  const list = allSymbols().filter((s) => (cat === "all" || s.category === cat) && (!q || s.label.toLowerCase().includes(q.toLowerCase()) || s.id.includes(q.toLowerCase())));
  return (
    <div className="ds-panel">
      <div className="ds-controls">
        <Seg label="Category" options={cats} value={cat} onChange={setCat} />
        <div className="ds-field">
          <span>Pen color</span>
          <div className="ds-seg" role="radiogroup" aria-label="Pen color">
            {pens.map((p) => (
              <Button key={p || "none"} size="sm" role="radio" aria-checked={pen === p} on={pen === p} onClick={() => setPen(p)} aria-label={p || "No color"}>
                {p ? <span className="ds-dot" style={{ background: p }} /> : "none"}
              </Button>
            ))}
          </div>
        </div>
        <label className="ds-field" style={{ flex: "1 1 180px" }}>
          <span>Search</span>
          <input className="ds-input" placeholder="k2tog, cable, m1…" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
      </div>
      <div className="ds-panel__body">
        <div className="ds-symbols">
          {list.map((s) => (
            <div key={s.id} className="ds-symbol">
              <div className="ds-symbol__glyph">
                <SymbolGlyph symbol={s} cell={Math.max(7, Math.min(22, Math.floor(100 / s.span)))} colorId={pen || null} />
              </div>
              <span className="ds-symbol__label">{s.label}</span>
              <span className="ds-symbol__id">{s.id} · {s.span} st</span>
            </div>
          ))}
          <div className="ds-symbol">
            <div className="ds-symbol__glyph"><MotifCellGlyph cell={22} /></div>
            <span className="ds-symbol__label">Motif</span>
            <span className="ds-symbol__id">MotifCellGlyph</span>
          </div>
          {!list.length && <p className="ds-note">No stitch matches “{q}”.</p>}
        </div>
      </div>
    </div>
  );
}

function IconGallery({ copy }: { copy: (t: string) => void }) {
  const [q, setQ] = useState("");
  const names = Object.keys(Icons).filter((n) => typeof (Icons as Record<string, unknown>)[n] === "function" && n.toLowerCase().includes(q.toLowerCase())).sort();
  return (
    <>
      <div className="ds-search">
        <input className="ds-input" placeholder="Filter icons…" aria-label="Filter icons" value={q} onChange={(e) => setQ(e.target.value)} />
        <span className="ds-note">{names.length} icons</span>
      </div>
      <div className="ds-icons">
        {names.map((n) => {
          const Icon = (Icons as unknown as Record<string, (p: object) => ReactNode>)[n]!;
          return (
            <button key={n} type="button" className="ds-icon" data-fill={n === "DragHandleIcon" || undefined} data-brand={n === "GoogleLogo" || undefined} onClick={() => copy(`<${n} />`)}>
              <Icon />
              <span>{n}</span>
            </button>
          );
        })}
        <button type="button" className="ds-icon" onClick={() => copy("<MotifGlyph />")}>
          <MotifGlyph size={22} />
          <span>MotifGlyph</span>
        </button>
      </div>
    </>
  );
}


/* ----------------------------------------------------------------- backlog */

const AREAS = ["All", "Components", "Tokens", "Structure", "Platform"] as const;

function Backlog({ requested, onRequest }: { requested: string; onRequest: (item: BacklogItem) => void }) {
  const [area, setArea] = useState<(typeof AREAS)[number]>("All");
  const items = backlog.filter((i) => area === "All" || i.area === area);
  return (
    <>
      <div className="ds-controls ds-panel">
        <Seg label="Area" options={AREAS} value={area} onChange={setArea} />
        <span className="ds-note">
          Counts come from the source each time this page is rebuilt, so items shrink as they're fixed. Add items to the request, then use Apply in the editor.
        </span>
      </div>
      <div className="ds-backlog">
        {items.map((item) => {
          const added = requested.includes(item.request);
          return (
            <article key={item.id} className="ds-backlog__item">
              <header>
                <span className="ds-pill ds-pill--no">{item.area}</span>
                <span className="ds-pill ds-pill--todo">Effort {item.effort}</span>
              </header>
              <h3>{item.title}</h3>
              {item.count !== null && (
                <p className="ds-backlog__count">
                  <b>{item.count}</b> {item.unit}
                </p>
              )}
              <p className="ds-note">{item.detail}</p>
              {item.where.length > 0 && (
                <details>
                  <summary>Where ({item.where.length})</summary>
                  <ul>
                    {item.where.map((w) => (
                      <li key={w}><code>{w}</code></li>
                    ))}
                  </ul>
                </details>
              )}
              <Button size="sm" variant={added ? "default" : "primary"} disabled={added} onClick={() => onRequest(item)}>
                {added ? "In the request" : "Add to request"}
              </Button>
            </article>
          );
        })}
      </div>
    </>
  );
}

/* --------------------------------------------------------------------- app */

const NAV: [string, [string, string][]][] = [
  ["Overview", [["inventory", "Inventory"], ["backlog", "Consolidation backlog"]]],
  ["Tokens", [["color", "Color"], ["type", "Typography"], ["spacing", "Spacing"], ["radius", "Radius & border"], ["size", "Sizes"], ["state", "Interaction state"], ["elevation", "Elevation"], ["layers", "Layers"], ["motion", "Motion"]]],
  ["Components", [["button", "Button"], ["iconbutton", "IconButton"], ["popover", "Popover"], ["dialog", "ConfirmDialog"], ["segmented", "SegmentedControl"], ["fields", "Form controls"], ["sidemodule", "SideModule & inset"], ["colorchip", "ColorChip"], ["quicktile", "QuickTile"], ["tooldock", "Tool dock"], ["rightpanel", "Right panel"], ["statusbar", "Status bar"], ["banners", "Banners"]]],
  ["Assets", [["glyphs", "Stitch symbols"], ["colorwork", "Colorwork palette"], ["icons", "Icons"], ["cursors", "Cursors"], ["geometry", "Component geometry"]]],
];

export function App() {
  const editing = useTokenEdits();
  const [open, setOpen] = useState(false);
  const [focus, setFocus] = useState<string | null>(null);
  const { toast, copy } = useCopy();
  const changed = Object.keys(editing.edits).length;
  const tokenCount = groups.reduce((n, g) => n + g.tokens.length, 0);
  const editToken = (name: string) => {
    setFocus(name);
    setOpen(true);
  };

  useEffect(() => {
    document.body.classList.toggle("ds-editing", open);
  }, [open]);

  return (
    <div className="ds">
      <div className="ds-bar-top">
        <span className="ds-bar-top__title">Stitch Ease design system</span>
        <span className="ds-note">{changed ? `${changed} unapplied change${changed === 1 ? "" : "s"}` : "Matches the app"}</span>
        <Button variant={open ? "default" : "primary"} size="sm" onClick={() => { setFocus(null); setOpen((v) => !v); }}>
          {open ? "Close editor" : changed ? "Review & apply" : "Edit tokens"}
        </Button>
      </div>

      <header className="ds-hero">
        <div className="ds-hero__inner">
          <span className="ds-eyebrow">Stitch Ease Designer · living style guide</span>
          <h1>Stitch Ease design system</h1>
          <p>
            This page is built from the app's own code: its stylesheets, its React components and <code>src/design/tokens.json</code>. Edit any token to preview the change on every component below, then press <b>Apply to app</b> to have Claude Code open a pull request that rolls it out across the app.
          </p>
          <div className="ds-hero__chips">
            {[[tokenCount, "tokens"], [Object.keys(Icons).filter((n) => /Icon$|Logo$/.test(n)).length, "icons"], [allSymbols().length, "stitch symbols"], [COLOR_GRID.length, "colorwork swatches"], [geometry.length, "geometry values"]].map(([n, l]) => (
              <span key={String(l)} className="ds-stat"><b>{n}</b>{l}</span>
            ))}
          </div>
        </div>
      </header>

      <div className="ds-layout">
        <nav className="ds-nav" aria-label="Sections">
          {NAV.map(([h, links]) => (
            <div key={h}>
              <h4>{h}</h4>
              {links.map(([id, label]) => <a key={id} href={`#${id}`}>{label}</a>)}
            </div>
          ))}
        </nav>

        <main className="ds-main">
          <Section id="inventory" title="Inventory" lede="Where each part of the UI gets its values. Everything below is either a token you can edit here, a shared component, or listed under Component geometry.">
            <div className="ds-panel ds-scroll">
              <table className="ds-table">
                <thead><tr><th>Piece</th><th>Source</th><th>Covers</th><th>Edit from this page</th></tr></thead>
                <tbody>
                  <tr><td><b>Tokens</b></td><td><code>src/design/tokens.json</code></td><td>Colors (UI, canvas, cursors), type, spacing, radius, borders, icon/control/layout sizes, elevation, layers, motion. Generates <code>tokens.css</code> and <code>tokens.generated.ts</code>.</td><td><span className="ds-pill ds-pill--ok">Yes: values</span></td></tr>
                  <tr><td><b>Components</b></td><td><code>src/ui/*</code></td><td>Button / IconButton (every button in the app), Popover, ConfirmDialog, SegmentedControl, TextField / Slider / Checkbox (every input), SideModule, ColorChip, QuickTile, SymbolGlyph, icons, plus the panels built from them. All styled through tokens.</td><td><span className="ds-pill ds-pill--todo">Via request note</span></td></tr>
                  <tr><td><b>Component geometry</b></td><td><code>src/styles/*.css</code></td><td>Fixed sizes and offsets that belong to one component (e.g. a 38px tool button). Listed below.</td><td><span className="ds-pill ds-pill--todo">Via request note</span></td></tr>
                  <tr><td><b>Colorwork palette</b></td><td><code>src/model/colorPalette.ts</code></td><td>32 swatches. Saved charts store a swatch's hex as its id, so changing one needs a data migration.</td><td><span className="ds-pill ds-pill--no">Read-only</span></td></tr>
                  <tr><td><b>Stitch symbols</b></td><td>Figma library → <code>symbols.generated.ts</code></td><td>63 symbols, synced by <code>scripts/sync-symbols.py</code>.</td><td><span className="ds-pill ds-pill--no">Edit in Figma</span></td></tr>
                  <tr><td><b>Guards</b></td><td><code>tokens.test.ts</code>, <code>build-tokens.test.mjs</code></td><td>Fail the build on: a raw color or raw px spacing, radius, type, line-height or letter-spacing in a component stylesheet; a hover rule outside <code>@media (hover: hover)</code>; a literal disabled opacity; an undeclared custom property; stale generated files.</td><td>—</td></tr>
                </tbody>
              </table>
            </div>
          </Section>

          <Section id="backlog" title="Consolidation backlog" lede="What still sidesteps the design system, and what to do about it. Each item can be added to the change request that Apply sends to Claude Code.">
            <Backlog
              requested={editing.note}
              onRequest={(item) => {
                const line = `- ${item.title}: ${item.request}`;
                editing.setNote(editing.note.trim() ? `${editing.note.trim()}\n${line}` : line);
                setFocus(null);
                setOpen(true);
              }}
            />
          </Section>

          <TokenSections edits={editing.edits} onEdit={editToken} />

          <Section id="button" title="Button" lede="The app's standard text button, rendered by the real component.">
            <ButtonPlayground />
          </Section>
          <Section id="iconbutton" title="IconButton" lede="An icon-only Button. Its label becomes the aria-label.">
            <IconButtons />
          </Section>
          <Section id="popover" title="Popover" lede="The shared floating surface. It closes on an outside click or Escape.">
            <PopoverDemo />
          </Section>
          <Section id="dialog" title="ConfirmDialog" lede="The app's replacement for window.confirm().">
            <DialogDemo />
          </Section>
          <Section id="segmented" title="SegmentedControl" lede="A single-choice row of options. appearance=&quot;custom&quot; keeps the behaviour with a component's own look.">
            <SegmentedDemo />
          </Section>
          <Section id="fields" title="Form controls" lede="TextField (default, inline, rename, unstyled), Slider and Checkbox from ui/Field.tsx.">
            <FieldsDemo />
          </Section>
          <Section id="sidemodule" title="SideModule & inset" lede="The right panel's card shell, collapsible or static, and the in-flow .inset surface.">
            <SideModuleDemo />
          </Section>
          <Section id="colorchip" title="ColorChip" lede="Opens the real 32-swatch colorwork popover.">
            <ColorChipDemo />
          </Section>
          <Section id="quicktile" title="QuickTile" lede="The stitch picker's quick slots. Click a tile to make it current, then use its color chip.">
            <QuickTiles />
          </Section>
          <Section id="tooldock" title="Tool dock" lede="The floating dock at the bottom of the canvas.">
            <Boundary name="Toolbar"><ToolDockDemo /></Boundary>
          </Section>
          <Section id="rightpanel" title="Right panel" lede="The editor's whole side panel (glossary, reference image, export, help, navigator), running on an empty chart.">
            <div className="ds-panel ds-panel-frame">
              <Boundary name="RightPanel"><RightPanel /></Boundary>
            </div>
          </Section>
          <Section id="statusbar" title="Status bar">
            <div className="ds-panel" style={{ overflow: "hidden" }}>
              <Boundary name="StatusBar"><StatusBar /></Boundary>
            </div>
          </Section>
          <Section id="banners" title="Banners">
            <div className="ds-panel" style={{ overflow: "hidden" }}>
              <div className="banner">This chart uses 2 stitches that aren't in the library any more. They show as blank cells.</div>
              <div className="banner banner--info"><span>Keyboard not appearing in stitch search? Turn off <strong>Scribble</strong> in Settings → Apple Pencil.</span><Button>Got it</Button></div>
              <div className="banner banner--bad"><span>This chart was changed in another tab. Reload to see the latest version.</span><Button>Reload</Button></div>
            </div>
          </Section>

          <Section id="glyphs" title="Stitch symbols" lede="All symbols from the Figma library, drawn by the real SymbolGlyph. Pick a pen color to see the colorwork ink rule.">
            <Glyphs />
          </Section>
          <Section id="colorwork" title="Colorwork palette" lede="Read-only here: saved charts store each swatch's hex as its id. Ink colors are tokens (--colorwork-ink-dark / -light).">
            <div className="ds-panel">
              <div className="ds-palette">
                {[0, 1, 2, 3].flatMap((step) =>
                  COLOR_GRID.filter((c) => c.step === step).map((c) => (
                    <button key={c.id} type="button" className="ds-pal" onClick={() => copy(c.hex)} title={`Copy ${c.hex}`}>
                      <div style={{ background: c.hex, color: c.ink === "dark" ? "var(--colorwork-ink-dark)" : "var(--colorwork-ink-light)" }}>{c.ink === "dark" ? "D" : "L"}</div>
                      <span>{step === 0 ? c.hue : c.hex}</span>
                    </button>
                  )),
                )}
              </div>
            </div>
          </Section>
          <Section id="icons" title="Icons" lede="Every icon component in src/ui/icons.tsx. Click to copy the JSX.">
            <IconGallery copy={copy} />
          </Section>
          <Section id="cursors" title="Cursors" lede="Canvas cursor artwork from Figma (src/canvas/assets/cursors). Generated cursors (straight-line, suggest confirm/dismiss, armed stitch) read their colors from tokens.">
            <div className="ds-panel">
              <div className="ds-cursors">
                {Object.entries(cursorAssets).map(([path, url]) => (
                  <figure key={path}>
                    <img src={url} alt="" />
                    <figcaption>{path.split("/").pop()}</figcaption>
                  </figure>
                ))}
              </div>
            </div>
          </Section>
          <Section id="geometry" title="Component geometry" lede="Fixed sizes and offsets that belong to one component rather than the scale. To change one, describe it in the editor's request note and Apply.">
            <div className="ds-panel ds-scroll">
              <table className="ds-table">
                <thead><tr><th>File</th><th>Selector</th><th>Declaration</th></tr></thead>
                <tbody>
                  {geometry.map((g, i) => (
                    <tr key={i}><td><code>{g.file}</code></td><td><code>{g.selector}</code></td><td><code>{g.declaration}</code></td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        </main>
      </div>

      {open && <EditorPanel {...editing} focusToken={focus} onClose={() => setOpen(false)} key={focus ?? "all"} />}
      {toast && <div className="ds-toast" role="status">{toast}</div>}
    </div>
  );
}
