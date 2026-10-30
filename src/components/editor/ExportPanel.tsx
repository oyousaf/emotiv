"use client";

import { useState } from "react";
import { FORMATS, type FormatId } from "@/lib/schema";
import { framesToTimecode, getTotalDuration } from "@/lib/timeline";
import { RENDER_QUALITIES, type RenderQuality } from "@/lib/types";
import { api } from "../api";
import { RenderList } from "../RenderList";
import { useEditor } from "./context";

const QUALITY_HINT: Record<RenderQuality, string> = {
  draft: "Half resolution, fast. For checking timing.",
  standard: "Full resolution, H.264 CRF 20.",
  high: "Full resolution, CRF 16, slower encode.",
};

export function ExportPanel() {
  const { projectId, doc } = useEditor();
  const [formats, setFormats] = useState<FormatId[]>([doc.format]);
  const [quality, setQuality] = useState<RenderQuality>("standard");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const toggle = (f: FormatId) =>
    setFormats((list) => (list.includes(f) ? list.filter((x) => x !== f) : [...list, f]));

  const enqueue = async () => {
    setBusy(true);
    setError(null);
    try {
      // The server snapshots the saved document, so save what's on screen first.
      await api.saveProject(projectId, { doc });
      for (const f of formats) await api.enqueueRender(projectId, f, quality);
      setRefreshKey((k) => k + 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4 p-3">
      <div>
        <h3 className="panel-title mb-2">Export MP4</h3>
        <p className="text-xs text-ink-500">
          {framesToTimecode(getTotalDuration(doc), doc.fps)} at {doc.fps} fps. Renders run in the background worker, so you
          can keep editing.
        </p>
      </div>
      <div>
        <span className="label">Formats</span>
        <div className="space-y-1">
          {(Object.keys(FORMATS) as FormatId[]).map((f) => (
            <label key={f} className="flex cursor-pointer items-center gap-2 text-sm">
              <input type="checkbox" className="accent-accent" checked={formats.includes(f)} onChange={() => toggle(f)} />
              {FORMATS[f].label}{" "}
              <span className="text-xs text-ink-500">
                {FORMATS[f].width}×{FORMATS[f].height}
              </span>
            </label>
          ))}
        </div>
      </div>
      <div>
        <span className="label">Quality</span>
        <div className="flex rounded-md border border-ink-600 p-0.5 text-xs">
          {RENDER_QUALITIES.map((q) => (
            <button
              key={q}
              onClick={() => setQuality(q)}
              className={`flex-1 rounded py-1 capitalize ${quality === q ? "bg-ink-700 text-white" : "text-ink-400 hover:text-ink-200"}`}
            >
              {q}
            </button>
          ))}
        </div>
        <p className="mt-1 text-[11px] text-ink-500">{QUALITY_HINT[quality]}</p>
      </div>
      <button className="btn btn-primary w-full" disabled={busy || formats.length === 0} onClick={enqueue}>
        {busy ? "Queueing…" : `Render ${formats.length > 1 ? `${formats.length} videos` : "video"}`}
      </button>
      {error ? <p className="text-xs text-bad">{error}</p> : null}
      <div>
        <h3 className="panel-title mb-2">This project&apos;s renders</h3>
        <RenderList projectId={projectId} refreshKey={refreshKey} compact />
      </div>
    </div>
  );
}
