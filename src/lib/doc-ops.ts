import type { ProjectDoc, Scene, SceneElement } from "./schema";
import { cloneScene, newId } from "./templates";
import { getSceneTimings } from "./timeline";

/** Immutable edits to a project document, used by the editor. */

export function updateScene(doc: ProjectDoc, sceneId: string, patch: Partial<Scene>): ProjectDoc {
  return { ...doc, scenes: doc.scenes.map((s) => (s.id === sceneId ? { ...s, ...patch } : s)) };
}

export function updateElement(
  doc: ProjectDoc,
  sceneId: string,
  elementId: string,
  patch: Partial<SceneElement>,
): ProjectDoc {
  return {
    ...doc,
    scenes: doc.scenes.map((s) =>
      s.id !== sceneId
        ? s
        : { ...s, elements: s.elements.map((e) => (e.id === elementId ? ({ ...e, ...patch } as SceneElement) : e)) },
    ),
  };
}

export function addScene(doc: ProjectDoc, scene: Scene, afterId?: string): ProjectDoc {
  const i = afterId ? doc.scenes.findIndex((s) => s.id === afterId) : -1;
  const scenes = [...doc.scenes];
  scenes.splice(i === -1 ? scenes.length : i + 1, 0, scene);
  return { ...doc, scenes };
}

export function duplicateScene(doc: ProjectDoc, sceneId: string): { doc: ProjectDoc; scene: Scene } | null {
  const src = doc.scenes.find((s) => s.id === sceneId);
  if (!src) return null;
  const scene = { ...cloneScene(src), name: `${src.name} copy` };
  return { doc: addScene(doc, scene, sceneId), scene };
}

export function removeScene(doc: ProjectDoc, sceneId: string): ProjectDoc {
  if (doc.scenes.length <= 1) return doc;
  return { ...doc, scenes: doc.scenes.filter((s) => s.id !== sceneId) };
}

export function moveScene(doc: ProjectDoc, sceneId: string, delta: number): ProjectDoc {
  const i = doc.scenes.findIndex((s) => s.id === sceneId);
  const j = i + delta;
  if (i === -1 || j < 0 || j >= doc.scenes.length) return doc;
  const scenes = [...doc.scenes];
  [scenes[i], scenes[j]] = [scenes[j], scenes[i]];
  return { ...doc, scenes };
}

export function addElement(doc: ProjectDoc, sceneId: string, el: SceneElement): ProjectDoc {
  return {
    ...doc,
    scenes: doc.scenes.map((s) => (s.id === sceneId ? { ...s, elements: [...s.elements, el] } : s)),
  };
}

export function removeElement(doc: ProjectDoc, sceneId: string, elementId: string): ProjectDoc {
  return {
    ...doc,
    scenes: doc.scenes.map((s) =>
      s.id === sceneId ? { ...s, elements: s.elements.filter((e) => e.id !== elementId) } : s,
    ),
  };
}

export function duplicateElement(doc: ProjectDoc, sceneId: string, elementId: string) {
  const scene = doc.scenes.find((s) => s.id === sceneId);
  const el = scene?.elements.find((e) => e.id === elementId);
  if (!el) return null;
  const copy = { ...structuredClone(el), id: newId("el"), name: `${el.name || el.type} copy`, y: Math.min(100, el.y + 5) };
  return { doc: addElement(doc, sceneId, copy), element: copy };
}

/** Move an element within its scene's layer order (later = on top). */
export function moveElement(doc: ProjectDoc, sceneId: string, elementId: string, delta: number): ProjectDoc {
  return {
    ...doc,
    scenes: doc.scenes.map((s) => {
      if (s.id !== sceneId) return s;
      const i = s.elements.findIndex((e) => e.id === elementId);
      const j = i + delta;
      if (i === -1 || j < 0 || j >= s.elements.length) return s;
      const elements = [...s.elements];
      [elements[i], elements[j]] = [elements[j], elements[i]];
      return { ...s, elements };
    }),
  };
}

/** Which scene is on screen at a project frame (the incoming one during transitions). */
export function sceneAtFrame(doc: ProjectDoc, frame: number): string | null {
  const timings = getSceneTimings(doc);
  for (let i = timings.length - 1; i >= 0; i--) {
    if (frame >= timings[i].from) return timings[i].sceneId;
  }
  return timings[0]?.sceneId ?? null;
}

/** Human-readable list of places an asset is referenced. */
export function assetUsage(doc: ProjectDoc, assetId: string): string[] {
  const uses: string[] = [];
  if (doc.soundtrack?.assetId === assetId) uses.push("soundtrack");
  for (const s of doc.scenes) {
    const bg = s.background;
    if ((bg.type === "image" || bg.type === "video") && bg.assetId === assetId) uses.push(`${s.name} background`);
    for (const e of s.elements) {
      if (e.type === "image" && e.assetId === assetId) uses.push(`${s.name} › ${e.name || "image"}`);
    }
  }
  return uses;
}
