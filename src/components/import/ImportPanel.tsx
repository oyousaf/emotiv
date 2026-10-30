"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { FormatId } from "@/lib/schema";
import type { ImportReport } from "@/lib/server/import";
import { listAepComps, listAepxComps } from "@/lib/importers/aep";
import { listLottieComps, type CompInfo } from "@/lib/importers/comps";
import { CompPicker } from "./CompPicker";
import { detectCuts } from "./detect-cuts";

const isJson = (f?: File) => !!f && /.json$/i.test(f.name);

/** List the compositions in an AE export or project file, in the browser. */
async function readComps(file: File): Promise<CompInfo[]> {
  if (/.json$/i.test(file.name)) {
    const json = JSON.parse(await file.text());
    if (!Array.isArray(json?.layers)) throw new Error("This JSON isn't a Bodymovin/Lottie export.");
    return listLottieComps(json);
  }
  if (/.aepx$/i.test(file.name)) return listAepxComps(await file.text());
  return listAepComps(await file.arrayBuffer());
}

/** The comp most likely to be the "main" one: not used inside others, most layers. */
function defaultComp(comps: CompInfo[], json: boolean): string | undefined {
  if (json) return comps[0]?.id;
  const top = comps.filter((c) => c.usedBy === 0);
  return [...(top.length ? top : comps)].sort((a, b) => b.layers.length - a.layers.length)[0]?.id;
}

type Stage = { label: string; progress: number } | null;

function Drop({
  label,
  hint,
  accept,
  multiple,
  files,
  onFiles,
}: {
  label: string;
  hint: string;
  accept: string;
  multiple?: boolean;
  files: File[];
  onFiles: (f: File[]) => void;
}) {
  const [over, setOver] = useState(false);
  return (
    <label
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const list = Array.from(e.dataTransfer.files);
        onFiles(multiple ? [...files, ...list] : list.slice(0, 1));
      }}
      className={`block cursor-pointer rounded-lg border border-dashed p-3 transition-colors ${
        over ? "border-accent bg-accent-soft" : files.length ? "border-ink-500 bg-ink-850" : "border-ink-600 hover:border-ink-400"
      }`}
    >
      <div className="text-sm font-medium text-ink-100">{label}</div>
      <div className="mt-0.5 text-[11px] leading-snug text-ink-500">{hint}</div>
      {files.length ? (
        <ul className="mt-2 space-y-0.5">
          {files.map((f, i) => (
            <li key={i} className="flex items-center justify-between gap-2 text-xs text-ink-300">
              <span className="truncate">{f.name}</span>
              <button
                type="button"
                className="text-ink-500 hover:text-bad"
                onClick={(e) => {
                  e.preventDefault();
                  onFiles(files.filter((_, j) => j !== i));
                }}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <input
        type="file"
        hidden
        accept={accept}
        multiple={multiple}
        onChange={(e) => {
          const list = Array.from(e.target.files ?? []);
          onFiles(multiple ? [...files, ...list] : list.slice(0, 1));
          e.target.value = "";
        }}
      />
    </label>
  );
}

function upload(form: FormData, onProgress: (p: number) => void) {
  return new Promise<{ project: { id: string; name: string }; report: ImportReport }>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/import");
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => {
      const body = JSON.parse(xhr.responseText || "{}");
      if (xhr.status >= 200 && xhr.status < 300) resolve(body);
      else reject(new Error(body.error ?? `Import failed (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error("Import failed"));
    xhr.send(form);
  });
}

/**
 * Import an old video and/or an After Effects export (Bodymovin → Lottie
 * JSON). Shot detection runs here in the browser; the server stores the
 * files and builds the project.
 */
export function ImportPanel() {
  const router = useRouter();
  const [video, setVideo] = useState<File[]>([]);
  const [lottie, setLottie] = useState<File[]>([]);
  const [extras, setExtras] = useState<File[]>([]);
  const [name, setName] = useState("");
  const [format, setFormat] = useState<FormatId | "auto">("auto");
  const [mode, setMode] = useState<"hybrid" | "exact">("hybrid");
  const [keepFootage, setKeepFootage] = useState(false);
  const [stage, setStage] = useState<Stage>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ id: string; name: string; report: ImportReport } | null>(null);
  const [comps, setComps] = useState<CompInfo[]>([]);
  const [compId, setCompId] = useState<string | undefined>();
  const [compError, setCompError] = useState<string | null>(null);
  const aeFile = lottie[0];
  const json = isJson(aeFile);

  useEffect(() => {
    setComps([]);
    setCompId(undefined);
    setCompError(null);
    if (!aeFile) return;
    let live = true;
    readComps(aeFile)
      .then((list) => {
        if (!live) return;
        if (!list.length) setCompError("No compositions found in this file.");
        setComps(list);
        setCompId(defaultComp(list, isJson(aeFile)));
      })
      .catch((e) => live && setCompError((e as Error).message));
    return () => {
      live = false;
    };
  }, [aeFile]);

  const selected = comps.find((c) => c.id === compId);

  const run = async () => {
    setError(null);
    setResult(null);
    try {
      let cuts: number[] = [];
      if (video[0] && !json) {
        setStage({ label: "Finding shots", progress: 0 });
        cuts = await detectCuts(video[0], (p) => setStage({ label: "Finding shots", progress: p }));
      }
      const form = new FormData();
      if (video[0]) form.append("video", video[0]);
      if (aeFile && json) form.append("lottie", aeFile);
      // .aep files stay in the browser; only the chosen comp's metadata is sent.
      const aep =
        aeFile && !json && selected
          ? { file: aeFile.name, name: selected.name, width: selected.width, height: selected.height, fps: selected.fps, durationSeconds: selected.durationSeconds, backgroundColor: selected.backgroundColor, layers: selected.layers.slice(0, 500), texts: selected.texts }
          : undefined;
      extras.forEach((f) => form.append("extra", f));
      form.append(
        "options",
        JSON.stringify({ name: name || undefined, format: format === "auto" ? undefined : format, mode, cuts, keepFootage, compId: json ? compId : undefined, aep }),
      );
      setStage({ label: "Uploading", progress: 0 });
      const res = await upload(form, (p) => setStage({ label: p < 1 ? "Uploading" : "Building project", progress: p }));
      setResult({ id: res.project.id, name: res.project.name, report: res.report });
      setVideo([]);
      setLottie([]);
      setExtras([]);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setStage(null);
    }
  };

  const r = result?.report;

  return (
    <div className="rounded-xl border border-ink-700 bg-ink-900 p-4">
      <h2 className="panel-title mb-1">Import</h2>
      <p className="mb-3 text-xs text-ink-500">
        Bring in an old video, an After Effects comp, or both, and emotiv builds the project for you.
      </p>
      <div className="grid gap-3 md:grid-cols-3">
        <Drop
          label="Old video"
          hint="MP4. Split into scenes at each cut, audio becomes the soundtrack, and it's shown as a tracing overlay."
          accept=".mp4,.m4v"
          files={video}
          onFiles={setVideo}
        />
        <Drop
          label="After Effects comp"
          hint="Bodymovin .json (rebuilt from its real layers and keyframes) or the .aep/.aepx project (pick a comp; its metadata seeds the rebuild)."
          accept=".json,.aep,.aepx"
          files={lottie}
          onFiles={setLottie}
        />
        <Drop
          label="Fonts and footage"
          hint="The fonts the comp uses (TTF/OTF/WOFF), plus any logos, images or clips you want available."
          accept=".ttf,.otf,.woff,.woff2,.png,.jpg,.jpeg,.webp,.gif,.mp4,.m4v,.mp3,.wav,.m4a,.ogg"
          multiple
          files={extras}
          onFiles={setExtras}
        />
      </div>

      {compError ? <p className="mt-2 text-sm text-bad">{compError}</p> : null}
      {comps.length ? <CompPicker comps={comps} selected={compId} onSelect={setCompId} fromProject={!json} /> : null}

      <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
        <label>
          <span className="label">Project name</span>
          <input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="From the file name" maxLength={100} />
        </label>
        <label>
          <span className="label">Format</span>
          <select className="field" value={format} onChange={(e) => setFormat(e.target.value as FormatId | "auto")}>
            <option value="auto">Match source</option>
            <option value="landscape">16:9</option>
            <option value="vertical">9:16</option>
          </select>
        </label>
        {json ? (
          <label>
            <span className="label">AE layers</span>
            <select className="field" value={mode} onChange={(e) => setMode(e.target.value as "hybrid" | "exact")}>
              <option value="hybrid">Editable text + exact graphics</option>
              <option value="exact">Play exactly as exported</option>
            </select>
          </label>
        ) : (
          <label className="flex items-center gap-2 pb-2 text-sm text-ink-300">
            <input type="checkbox" className="accent-accent" checked={keepFootage} onChange={(e) => setKeepFootage(e.target.checked)} disabled={!video[0]} />
            Keep original footage as backgrounds
          </label>
        )}
      </div>

      <div className="mt-3 flex items-center gap-3">
        <button className="btn btn-primary" disabled={!!stage || (!video[0] && !aeFile) || (!!aeFile && !selected)} onClick={run}>
          {stage ? `${stage.label}…` : "Import"}
        </button>
        {stage ? (
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-ink-700">
            <div className="h-full bg-accent transition-[width]" style={{ width: `${stage.progress * 100}%` }} />
          </div>
        ) : null}
      </div>
      {error ? <p className="mt-2 text-sm text-bad">{error}</p> : null}

      {result && r ? (
        <div className="mt-3 rounded-lg border border-ok/30 bg-ok/5 p-3 text-sm">
          <div className="font-medium text-ok">Imported “{result.name}”</div>
          <ul className="mt-1 list-inside list-disc text-xs text-ink-300">
            {r.shots != null ? <li>{r.shots} shot{r.shots === 1 ? "" : "s"} detected, one scene each</li> : null}
            {r.lottie ? (
              <li>
                {r.lottie.scenes} scene{r.lottie.scenes === 1 ? "" : "s"}, {r.lottie.textLayers} editable text layer
                {r.lottie.textLayers === 1 ? "" : "s"}, {r.lottie.shapeLayers} shape{r.lottie.shapeLayers === 1 ? "" : "s"}
                {r.lottie.keptAsGraphics ? `, ${r.lottie.keptAsGraphics} layers kept as exact graphics` : ""}
              </li>
            ) : null}
            {r.aep ? <li>Comp “{r.aep.comp}”: {r.aep.layers} layers and {r.aep.texts} text strings recorded for the AI tab</li> : null}
            {r.audio ? <li>Soundtrack extracted from the video</li> : null}
            {r.reference ? <li>Original video set as a tracing overlay (toggle “Ref” under the preview)</li> : null}
            {[...(r.lottie?.notes ?? []), ...r.notes].map((n, i) => (
              <li key={i} className="text-warn">
                {n}
              </li>
            ))}
          </ul>
          <button className="btn btn-primary mt-2 py-1! text-xs" onClick={() => router.push(`/projects/${result.id}`)}>
            Open project →
          </button>
        </div>
      ) : null}
    </div>
  );
}
