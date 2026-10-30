"use client";

import type { PlayerRef } from "@remotion/player";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SYSTEM_FONTS, type ProjectDoc, type Scene } from "@/lib/schema";
import { getSceneTimings } from "@/lib/timeline";
import type { AssetRecord, CustomTemplate, ProjectRecord } from "@/lib/types";
import { api } from "../api";
import { SeasonalEmoji } from "../SeasonalTheme";
import { AssetsPanel } from "./AssetsPanel";
import { EditorContext, type BuiltinTemplateInfo, type EditorApi, type Selection } from "./context";
import { ExportPanel } from "./ExportPanel";
import { Inspector } from "./Inspector";
import { Preview } from "./Preview";
import { ScenesPanel } from "./ScenesPanel";
import { useHistory } from "./useHistory";

type SaveState = "saved" | "pending" | "saving" | "error";
type Tab = "scenes" | "assets" | "export";

export function Editor({
  project,
  initialAssets,
  builtinTemplates,
  initialCustomTemplates,
}: {
  project: ProjectRecord;
  initialAssets: AssetRecord[];
  builtinTemplates: BuiltinTemplateInfo[];
  initialCustomTemplates: (CustomTemplate & { scene: Scene })[];
}) {
  const history = useHistory<ProjectDoc>(project.doc);
  const doc = history.present;
  const [name, setName] = useState(project.name);
  const [assets, setAssets] = useState(initialAssets);
  const [customTemplates, setCustomTemplates] = useState(initialCustomTemplates);
  const [selection, setSelection] = useState<Selection>({ sceneId: project.doc.scenes[0].id, elementId: null });
  const [save, setSave] = useState<{ state: SaveState; error?: string }>({ state: "saved" });
  const [tab, setTab] = useState<Tab>("scenes");
  const playerRef = useRef<PlayerRef>(null);

  // Keep the selection valid when scenes or elements disappear (delete, undo).
  const scene = doc.scenes.find((s) => s.id === selection.sceneId) ?? doc.scenes[0];
  const element = scene.elements.find((e) => e.id === selection.elementId) ?? null;

  // ------------------------------------------------------------ autosave
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    setSave({ state: "pending" });
    const t = setTimeout(async () => {
      setSave({ state: "saving" });
      try {
        await api.saveProject(project.id, { name, doc });
        setSave({ state: "saved" });
      } catch (e) {
        setSave({ state: "error", error: (e as Error).message });
      }
    }, 700);
    return () => clearTimeout(t);
  }, [doc, name, project.id]);

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (save.state !== "saved") e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [save.state]);

  // ------------------------------------------------------- keyboard undo
  const { undo, redo } = history;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest("input, textarea, select")) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  const seek = useCallback((frame: number) => {
    playerRef.current?.pause();
    playerRef.current?.seekTo(Math.max(0, Math.round(frame)));
  }, []);

  const docRef = useRef(doc);
  docRef.current = doc;
  const select = useCallback(
    (sel: Selection, opts?: { seek?: boolean }) => {
      setSelection(sel);
      if (opts?.seek) {
        const d = docRef.current;
        const t = getSceneTimings(d).find((x) => x.sceneId === sel.sceneId);
        const s = d.scenes.find((x) => x.id === sel.sceneId);
        if (!t || !s) return;
        const el = s.elements.find((e) => e.id === sel.elementId);
        // Land where the scene (or element) has finished animating in.
        const offset = el ? el.start + el.animIn.delay + el.animIn.duration + 10 : t.transitionIn + 40;
        seek(t.from + Math.min(s.duration - 1, offset));
      }
    },
    [seek],
  );

  const refreshTemplates = useCallback(async () => {
    const t = await api.listTemplates();
    setCustomTemplates(t.custom);
  }, []);

  const fonts = useMemo(() => {
    const custom = assets.filter((a) => a.kind === "font" && a.family).map((a) => a.family!);
    return [...new Set([...custom, ...SYSTEM_FONTS])];
  }, [assets]);

  const ctx: EditorApi = {
    projectId: project.id,
    doc,
    setDoc: history.set,
    assets,
    setAssets,
    selection: { sceneId: scene.id, elementId: element?.id ?? null },
    select,
    scene,
    element,
    fonts,
    seek,
    builtinTemplates,
    customTemplates,
    refreshTemplates,
  };

  return (
    <EditorContext.Provider value={ctx}>
      <div className="flex h-dvh flex-col">
        <header className="flex h-12 shrink-0 items-center gap-3 border-b border-ink-800 bg-ink-900 px-3">
          <Link href="/" className="btn btn-ghost btn-icon text-ink-400" title="Back to projects">
            ← <span className="hidden sm:inline">Projects</span>
          </Link>
          <Link href="/" className="hidden scale-75 md:block" title="emotiv AI">
            <SeasonalEmoji />
          </Link>
          <input
            className="min-w-0 flex-1 rounded bg-transparent px-2 py-1 text-sm font-medium outline-none hover:bg-ink-800 focus:bg-ink-800 sm:max-w-md"
            value={name}
            maxLength={100}
            onChange={(e) => setName(e.target.value)}
            aria-label="Project name"
          />
          <div className="ml-auto flex items-center gap-1">
            <button className="btn btn-ghost btn-icon text-sm" onClick={undo} disabled={!history.canUndo} title="Undo (Ctrl+Z)">
              ↶
            </button>
            <button className="btn btn-ghost btn-icon text-sm" onClick={redo} disabled={!history.canRedo} title="Redo (Ctrl+Shift+Z)">
              ↷
            </button>
            <span
              className={`ml-2 w-20 text-right text-xs ${save.state === "error" ? "text-bad" : "text-ink-500"}`}
              title={save.error}
            >
              {save.state === "saved" ? "Saved" : save.state === "error" ? "Save failed" : "Saving…"}
            </span>
            <button className="btn btn-primary ml-2 !py-1 text-xs" onClick={() => setTab("export")}>
              Export
            </button>
          </div>
        </header>

        <div className="grid min-h-0 flex-1 grid-cols-[260px_1fr_320px]">
          <aside className="flex min-h-0 flex-col border-r border-ink-800 bg-ink-900">
            <nav className="flex shrink-0 border-b border-ink-800 text-xs">
              {(["scenes", "assets", "export"] as Tab[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`flex-1 py-2.5 font-semibold uppercase tracking-wider transition-colors ${
                    tab === t ? "border-b-2 border-accent text-ink-100" : "border-b-2 border-transparent text-ink-500 hover:text-ink-300"
                  }`}
                >
                  {t}
                </button>
              ))}
            </nav>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {tab === "scenes" ? <ScenesPanel /> : tab === "assets" ? <AssetsPanel /> : <ExportPanel />}
            </div>
          </aside>

          <main className="flex min-h-0 min-w-0 flex-col bg-ink-950">
            <Preview playerRef={playerRef} />
          </main>

          <aside className="min-h-0 overflow-y-auto border-l border-ink-800 bg-ink-900">
            <Inspector />
          </aside>
        </div>
      </div>
    </EditorContext.Provider>
  );
}
