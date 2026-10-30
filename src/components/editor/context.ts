"use client";

import { createContext, useContext } from "react";
import type { ProjectDoc, Scene, SceneElement } from "@/lib/schema";
import type { AssetRecord, CustomTemplate } from "@/lib/types";

export type Selection = { sceneId: string; elementId: string | null };
export type BuiltinTemplateInfo = { id: string; name: string; category: string; description: string };

export type EditorApi = {
  projectId: string;
  doc: ProjectDoc;
  /** Apply an edit. Edits within `coalesceMs` of each other share one undo step. */
  setDoc: (fn: (doc: ProjectDoc) => ProjectDoc) => void;
  assets: AssetRecord[];
  setAssets: React.Dispatch<React.SetStateAction<AssetRecord[]>>;
  selection: Selection;
  select: (sel: Selection, opts?: { seek?: boolean }) => void;
  scene: Scene;
  element: SceneElement | null;
  fonts: string[];
  seek: (frame: number) => void;
  builtinTemplates: BuiltinTemplateInfo[];
  customTemplates: (CustomTemplate & { scene: Scene })[];
  refreshTemplates: () => Promise<void>;
};

export const EditorContext = createContext<EditorApi | null>(null);

export function useEditor(): EditorApi {
  const ctx = useContext(EditorContext);
  if (!ctx) throw new Error("useEditor outside EditorContext");
  return ctx;
}
