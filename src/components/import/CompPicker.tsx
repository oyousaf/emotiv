"use client";

import type { CompInfo } from "@/lib/importers/comps";

const fmtDuration = (s: number | null) => (s == null ? "?" : s >= 60 ? `${Math.floor(s / 60)}m ${Math.round(s % 60)}s` : `${s.toFixed(1)}s`);

/** Lists the compositions found in an After Effects file so one can be picked. */
export function CompPicker({
  comps,
  selected,
  onSelect,
  fromProject,
}: {
  comps: CompInfo[];
  selected?: string;
  onSelect: (id: string) => void;
  /** True for .aep/.aepx (metadata only); false for a Bodymovin export. */
  fromProject: boolean;
}) {
  const current = comps.find((c) => c.id === selected);
  return (
    <div className="mt-3 rounded-lg border border-ink-700 bg-ink-850 p-3">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h3 className="panel-title">
          {comps.length} composition{comps.length === 1 ? "" : "s"} found · choose one to rebuild
        </h3>
        {fromProject ? <span className="text-[11px] text-ink-500">Read from the project file</span> : null}
      </div>
      <div className="grid max-h-56 gap-1.5 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">
        {comps.map((c) => {
          const active = c.id === selected;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => onSelect(c.id)}
              className={`rounded-md border px-2.5 py-2 text-left transition-colors ${
                active ? "border-accent bg-accent-soft" : "border-ink-700 hover:border-ink-500"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-medium">{c.name}</span>
                {c.id === "root" ? <span className="shrink-0 text-[10px] uppercase tracking-wider text-accent">main</span> : null}
                {c.usedBy > 0 ? <span className="shrink-0 text-[10px] text-ink-500">precomp ×{c.usedBy}</span> : null}
              </div>
              <div className="mt-0.5 text-[11px] text-ink-400">
                {c.width && c.height ? `${c.width}×${c.height}` : "size ?"} · {c.fps ? `${c.fps} fps` : "fps ?"} · {fmtDuration(c.durationSeconds)}
              </div>
              <div className="text-[11px] text-ink-500">
                {Object.entries(c.counts)
                  .map(([k, v]) => `${v} ${k}`)
                  .join(" · ") || "no layers"}
              </div>
            </button>
          );
        })}
      </div>
      {current ? (
        <div className="mt-2 space-y-1 text-[11px] text-ink-400">
          {current.texts.length ? (
            <div>
              <span className="text-ink-500">Text: </span>
              {current.texts.map((t) => `“${t.slice(0, 60)}”`).join(", ")}
            </div>
          ) : null}
          {current.fonts.length ? (
            <div>
              <span className="text-ink-500">Fonts: </span>
              {current.fonts.join(", ")} (add the font files under Fonts and footage)
            </div>
          ) : null}
          {current.layers.length ? (
            <div className="truncate" title={current.layers.map((l) => l.name).join(", ")}>
              <span className="text-ink-500">Layers: </span>
              {current.layers.slice(0, 12).map((l) => l.name || l.type).join(", ")}
              {current.layers.length > 12 ? ` +${current.layers.length - 12} more` : ""}
            </div>
          ) : null}
          {fromProject ? (
            <div className="text-ink-500">
              emotiv builds a starting point from this comp&apos;s size, length, colour and text, and saves its layer list for the AI
              tab. For the exact animation, export the same comp with Bodymovin and drop the JSON here instead.
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
