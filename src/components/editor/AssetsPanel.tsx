"use client";

import { useRef, useState } from "react";
import { addElement, updateElement, updateScene } from "@/lib/doc-ops";
import { editorAssetUrl } from "@/lib/props";
import { fontStack } from "@/remotion/elements";
import { imageElement, type AssetKind } from "@/lib/schema";
import { newId } from "@/lib/templates";
import type { AssetRecord } from "@/lib/types";
import { api } from "../api";
import { useEditor } from "./context";

/** Must match UPLOAD_RULES in lib/server/uploads.ts (a test checks this). */
export const UPLOAD_EXTENSIONS = ["mp4", "m4v", "png", "jpg", "jpeg", "webp", "gif", "mp3", "wav", "m4a", "ogg", "ttf", "otf", "woff", "woff2"];

const KIND_LABEL: Record<AssetKind, string> = { video: "Video", image: "Images", audio: "Audio", font: "Fonts" };

function uploadWithProgress(projectId: string, files: File[], onProgress: (p: number) => void) {
  return new Promise<AssetRecord[]>((resolve, reject) => {
    const form = new FormData();
    files.forEach((f) => form.append("file", f));
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/projects/${projectId}/assets`);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => {
      const body = JSON.parse(xhr.responseText || "{}");
      if (xhr.status >= 200 && xhr.status < 300) resolve(body);
      else reject(new Error(body.error ?? `Upload failed (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error("Upload failed"));
    xhr.send(form);
  });
}

const size = (b: number) => (b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(b / 1024)} KB`);

export function AssetsPanel() {
  const { projectId, doc, setDoc, assets, setAssets, scene, element, select } = useEditor();
  const input = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [over, setOver] = useState(false);

  const upload = async (files: File[]) => {
    if (!files.length) return;
    setError(null);
    // One request per file so one bad file doesn't sink the batch.
    for (const [i, file] of files.entries()) {
      try {
        setProgress(i / files.length);
        const stored = await uploadWithProgress(projectId, [file], (p) => setProgress((i + p) / files.length));
        setAssets((a) => [...a, ...stored]);
      } catch (e) {
        setError(`${file.name}: ${(e as Error).message}`);
      }
    }
    setProgress(null);
  };

  const remove = async (a: AssetRecord) => {
    if (!confirm(`Delete ${a.name}?`)) return;
    try {
      await api.deleteAsset(projectId, a.id);
      setAssets((list) => list.filter((x) => x.id !== a.id));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const grouped = (["video", "image", "audio", "font"] as AssetKind[]).map((kind) => ({
    kind,
    items: assets.filter((a) => a.kind === kind),
  }));

  return (
    <div className="p-3">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          upload(Array.from(e.dataTransfer.files));
        }}
        onClick={() => input.current?.click()}
        className={`mb-3 cursor-pointer rounded-lg border border-dashed px-3 py-5 text-center transition-colors ${
          over ? "border-accent bg-accent-soft" : "border-ink-600 hover:border-ink-400"
        }`}
      >
        <div className="text-sm text-ink-200">Drop files or click to upload</div>
        <div className="mt-1 text-[11px] text-ink-500">MP4 · PNG/JPG/WebP/GIF · MP3/WAV/M4A/OGG · TTF/OTF/WOFF</div>
        <input
          ref={input}
          type="file"
          multiple
          hidden
          accept={UPLOAD_EXTENSIONS.map((e) => `.${e}`).join(",")}
          onChange={(e) => {
            upload(Array.from(e.target.files ?? []));
            e.target.value = "";
          }}
        />
      </div>
      {progress != null ? (
        <div className="mb-3 h-1 overflow-hidden rounded-full bg-ink-700">
          <div className="h-full bg-accent transition-[width]" style={{ width: `${progress * 100}%` }} />
        </div>
      ) : null}
      {error ? <p className="mb-3 text-xs text-bad">{error}</p> : null}

      {grouped.map(({ kind, items }) =>
        items.length ? (
          <div key={kind} className="mb-4">
            <h3 className="panel-title mb-2">{KIND_LABEL[kind]}</h3>
            <ul className="space-y-2">
              {items.map((a) => {
                const url = editorAssetUrl(a);
                const isSoundtrack = doc.soundtrack?.assetId === a.id;
                return (
                  <li key={a.id} className="rounded-lg border border-ink-700 bg-ink-850 p-2">
                    <div className="flex items-center gap-2">
                      <div className="flex h-10 w-14 shrink-0 items-center justify-center overflow-hidden rounded bg-black text-ink-400">
                        {kind === "image" ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={url} alt="" className="h-full w-full object-contain" />
                        ) : kind === "video" ? (
                          <video src={url} muted preload="metadata" className="h-full w-full object-cover" />
                        ) : kind === "font" ? (
                          <span style={{ fontFamily: fontStack(a.family ?? "") }} className="text-lg text-white">
                            Aa
                          </span>
                        ) : (
                          <span>♪</span>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-xs text-ink-100" title={a.name}>
                          {a.name}
                        </div>
                        <div className="text-[10px] text-ink-500">
                          {size(a.size)}
                          {a.durationInSeconds ? ` · ${a.durationInSeconds.toFixed(1)}s` : ""}
                          {a.width ? ` · ${a.width}×${a.height}` : ""}
                          {a.family ? ` · "${a.family}"` : ""}
                        </div>
                      </div>
                      <button className="px-1 text-xs text-ink-500 hover:text-bad" title="Delete asset" onClick={() => remove(a)}>
                        ✕
                      </button>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {kind === "image" ? (
                        <>
                          <Action
                            onClick={() => {
                              const el = imageElement.parse({ id: newId("el"), type: "image", name: a.name, assetId: a.id, width: 30, animIn: { preset: "scale" } });
                              setDoc((d) => addElement(d, scene.id, el));
                              select({ sceneId: scene.id, elementId: el.id });
                            }}
                          >
                            Add to scene
                          </Action>
                          <Action onClick={() => setDoc((d) => updateScene(d, scene.id, { background: { type: "image", assetId: a.id, dim: 0.3, kenBurns: true } }))}>
                            Background
                          </Action>
                        </>
                      ) : null}
                      {kind === "video" ? (
                        <Action onClick={() => setDoc((d) => updateScene(d, scene.id, { background: { type: "video", assetId: a.id, dim: 0.3, playbackRate: 1 } }))}>
                          Use as background
                        </Action>
                      ) : null}
                      {kind === "audio" ? (
                        <Action
                          onClick={() =>
                            setDoc((d) => ({ ...d, soundtrack: isSoundtrack ? null : { assetId: a.id, volume: 0.8, fadeOut: 30 } }))
                          }
                        >
                          {isSoundtrack ? "Remove soundtrack" : "Use as soundtrack"}
                        </Action>
                      ) : null}
                      {kind === "font" && element?.type === "text" ? (
                        <Action onClick={() => setDoc((d) => updateElement(d, scene.id, element.id, { fontFamily: a.family! }))}>
                          Apply to “{element.name || "text"}”
                        </Action>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null,
      )}
      {assets.length === 0 ? <p className="text-center text-xs text-ink-500">No assets yet.</p> : null}
    </div>
  );
}

function Action({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button className="rounded border border-ink-600 px-1.5 py-0.5 text-[11px] text-ink-300 hover:border-ink-400 hover:text-white" onClick={onClick}>
      {children}
    </button>
  );
}
