"use client";

import { useState } from "react";
import { addScene, duplicateScene, moveScene, removeScene } from "@/lib/doc-ops";
import { cloneScene, getBuiltinTemplate } from "@/lib/templates";
import { getSceneTimings } from "@/lib/timeline";
import type { Scene } from "@/lib/schema";
import { api } from "../api";
import { useEditor } from "./context";

export function ScenesPanel() {
  const { doc, setDoc, scene: selected, select, builtinTemplates, customTemplates, refreshTemplates } = useEditor();
  const [adding, setAdding] = useState(false);
  const timings = getSceneTimings(doc);

  const insert = (scene: Scene) => {
    setDoc((d) => addScene(d, scene, selected.id));
    select({ sceneId: scene.id, elementId: null }, { seek: true });
    setAdding(false);
  };

  return (
    <div className="p-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="panel-title">Scenes</h3>
        <button className="btn !py-1 text-xs" onClick={() => setAdding((a) => !a)}>
          {adding ? "Close" : "+ Add scene"}
        </button>
      </div>

      {adding ? (
        <div className="mb-3 space-y-1 rounded-lg border border-ink-700 bg-ink-850 p-2">
          <div className="px-1 pb-1 text-[11px] text-ink-500">Animation templates</div>
          {builtinTemplates.map((t) => (
            <button
              key={t.id}
              className="block w-full rounded px-2 py-1.5 text-left hover:bg-ink-700"
              onClick={() => insert(getBuiltinTemplate(t.id)!.build(doc.format))}
            >
              <div className="text-sm">{t.name}</div>
              <div className="text-[11px] text-ink-500">{t.description}</div>
            </button>
          ))}
          {customTemplates.length ? (
            <div className="px-1 pt-2 pb-1 text-[11px] text-ink-500">Saved templates</div>
          ) : null}
          {customTemplates.map((t) => (
            <div key={t.id} className="group flex items-center rounded hover:bg-ink-700">
              <button className="flex-1 px-2 py-1.5 text-left text-sm" onClick={() => insert(cloneScene(t.scene))}>
                ★ {t.name}
              </button>
              <button
                className="px-2 text-xs text-ink-500 opacity-0 group-hover:opacity-100 hover:text-bad"
                title="Delete template"
                onClick={async () => {
                  if (!confirm(`Delete template "${t.name}"?`)) return;
                  await api.deleteTemplate(t.id);
                  await refreshTemplates();
                }}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      ) : null}

      <ol className="space-y-1">
        {doc.scenes.map((s, i) => {
          const active = s.id === selected.id;
          return (
            <li key={s.id}>
              <div
                role="button"
                tabIndex={0}
                onClick={() => select({ sceneId: s.id, elementId: null }, { seek: true })}
                onKeyDown={(e) => e.key === "Enter" && select({ sceneId: s.id, elementId: null }, { seek: true })}
                className={`group flex cursor-pointer items-center gap-2 rounded-md border px-2 py-2 transition-colors ${
                  active ? "border-accent/60 bg-accent-soft" : "border-transparent hover:bg-ink-800"
                }`}
              >
                <span className="w-5 shrink-0 text-center font-mono text-[11px] text-ink-500">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm">{s.name}</div>
                  <div className="text-[11px] text-ink-500">
                    {(s.duration / doc.fps).toFixed(1)}s · {s.elements.length} layers
                    {timings[i].transitionIn ? ` · ${s.transition.type}` : ""}
                  </div>
                </div>
                <div className="flex shrink-0 opacity-0 transition-opacity group-hover:opacity-100">
                  <IconBtn title="Move up" disabled={i === 0} onClick={() => setDoc((d) => moveScene(d, s.id, -1))}>
                    ↑
                  </IconBtn>
                  <IconBtn
                    title="Move down"
                    disabled={i === doc.scenes.length - 1}
                    onClick={() => setDoc((d) => moveScene(d, s.id, 1))}
                  >
                    ↓
                  </IconBtn>
                  <IconBtn
                    title="Duplicate"
                    onClick={() => {
                      const r = duplicateScene(doc, s.id);
                      if (r) {
                        setDoc(() => r.doc);
                        select({ sceneId: r.scene.id, elementId: null });
                      }
                    }}
                  >
                    ⧉
                  </IconBtn>
                  <IconBtn
                    title="Delete"
                    disabled={doc.scenes.length <= 1}
                    onClick={() => setDoc((d) => removeScene(d, s.id))}
                  >
                    ✕
                  </IconBtn>
                </div>
              </div>
            </li>
          );
        })}
      </ol>
      <p className="mt-4 px-1 text-[11px] leading-relaxed text-ink-600">
        Space plays, ← → step frames, Ctrl+Z undoes. Drag bar edges in the timeline to retime.
      </p>
    </div>
  );
}

function IconBtn({
  children,
  onClick,
  title,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  disabled?: boolean;
}) {
  return (
    <button
      title={title}
      disabled={disabled}
      className="rounded px-1 text-xs text-ink-400 hover:bg-ink-600 hover:text-white disabled:opacity-30"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      {children}
    </button>
  );
}
