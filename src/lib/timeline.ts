import { FORMATS, type FormatId, type ProjectDoc, type Scene, type SceneElement } from "./schema";

export type SceneTiming = {
  sceneId: string;
  /** First frame of the scene on the project timeline. */
  from: number;
  duration: number;
  /** Frames this scene overlaps the previous one (its incoming transition). */
  transitionIn: number;
};

/**
 * A transition can't be longer than either neighbouring scene, otherwise
 * TransitionSeries throws. Scene 0 never has an incoming transition.
 */
export function effectiveTransition(scenes: Scene[], index: number): number {
  if (index === 0) return 0;
  const s = scenes[index];
  if (s.transition.type === "none") return 0;
  const limit = Math.min(scenes[index - 1].duration, s.duration) - 1;
  return Math.max(0, Math.min(s.transition.duration, limit));
}

export function getSceneTimings(doc: Pick<ProjectDoc, "scenes">): SceneTiming[] {
  const timings: SceneTiming[] = [];
  let cursor = 0;
  doc.scenes.forEach((scene, i) => {
    const transitionIn = effectiveTransition(doc.scenes, i);
    cursor -= transitionIn;
    timings.push({ sceneId: scene.id, from: cursor, duration: scene.duration, transitionIn });
    cursor += scene.duration;
  });
  return timings;
}

export function getTotalDuration(doc: Pick<ProjectDoc, "scenes">): number {
  const t = getSceneTimings(doc);
  const last = t[t.length - 1];
  return Math.max(1, last ? last.from + last.duration : 1);
}

export function getDimensions(format: FormatId) {
  return FORMATS[format];
}

/** Frame range inside the scene where the element is mounted. */
export function elementWindow(el: SceneElement, sceneDuration: number) {
  const start = Math.min(el.start, sceneDuration - 1);
  const end = el.duration == null ? sceneDuration : Math.min(sceneDuration, start + el.duration);
  return { start, duration: Math.max(1, end - start) };
}

export function framesToTimecode(frame: number, fps: number): string {
  const totalSeconds = Math.floor(frame / fps);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  const f = Math.floor(frame % fps);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}:${String(f).padStart(2, "0")}`;
}
