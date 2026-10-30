"use client";

import { useRef } from "react";
import { updateElement, updateScene } from "@/lib/doc-ops";
import { elementWindow, getSceneTimings } from "@/lib/timeline";
import { useEditor } from "./context";

const ELEMENT_COLORS = { text: "bg-accent/70", shape: "bg-cyan/60", image: "bg-warn/60", lottie: "bg-ok/60" } as const;

/**
 * Horizontal drag helper: reports the drag distance in whole frames.
 * All moves of one drag land in a single undo step thanks to history coalescing.
 */
function useFrameDrag(getPxPerFrame: () => number) {
  return (e: React.PointerEvent, onMove: (deltaFrames: number) => void) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const pxPerFrame = getPxPerFrame();
    const move = (ev: PointerEvent) => onMove(Math.round((ev.clientX - startX) / pxPerFrame));
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
}

export function Timeline({ frame, duration }: { frame: number; duration: number }) {
  const { doc, setDoc, scene, selection, select, seek } = useEditor();
  const track = useRef<HTMLDivElement>(null);
  const timings = getSceneTimings(doc);
  const sceneTiming = timings.find((t) => t.sceneId === scene.id)!;
  const drag = useFrameDrag(() => (track.current?.clientWidth ?? 800) / duration);
  const pct = (f: number) => `${(f / duration) * 100}%`;

  const seekFromEvent = (e: React.PointerEvent) => {
    const rect = track.current!.getBoundingClientRect();
    const f = ((e.clientX - rect.left) / rect.width) * duration;
    seek(Math.min(duration - 1, Math.max(0, f)));
    const move = (ev: PointerEvent) => seek(Math.min(duration - 1, Math.max(0, ((ev.clientX - rect.left) / rect.width) * duration)));
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const seconds = Math.floor(duration / doc.fps);
  const tickEvery = seconds > 40 ? 5 : seconds > 15 ? 2 : 1;

  return (
    <div className="shrink-0 border-t border-ink-800 bg-ink-900 px-3 pt-1 pb-3 select-none">
      <div ref={track} className="relative">
        {/* Ruler */}
        <div className="relative h-5 cursor-pointer text-[10px] text-ink-500" onPointerDown={seekFromEvent}>
          {Array.from({ length: Math.floor(seconds / tickEvery) + 1 }, (_, i) => i * tickEvery).map((s) => (
            <span key={s} className="absolute top-0.5 -translate-x-1/2 font-mono" style={{ left: pct(s * doc.fps) }}>
              {s}s
            </span>
          ))}
        </div>

        {/* Scenes */}
        <div className="relative h-9 cursor-pointer rounded bg-ink-850" onPointerDown={seekFromEvent}>
          {doc.scenes.map((s, i) => {
            const t = timings[i];
            const active = s.id === scene.id;
            return (
              <div
                key={s.id}
                className={`absolute top-0.5 bottom-0.5 overflow-hidden rounded border text-[11px] transition-colors ${
                  active ? "z-10 border-accent bg-accent-soft text-ink-100" : "border-ink-600 bg-ink-800 text-ink-400 hover:border-ink-500"
                }`}
                style={{ left: pct(t.from), width: pct(t.duration) }}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  select({ sceneId: s.id, elementId: null }, { seek: true });
                }}
              >
                {t.transitionIn > 0 ? (
                  <div className="absolute inset-y-0 left-0 bg-gradient-to-r from-ink-500/40 to-transparent" style={{ width: pct(t.transitionIn * (duration / t.duration)) }} />
                ) : null}
                <span className="relative truncate px-1.5 leading-8">{s.name}</span>
                <div
                  className="absolute inset-y-0 right-0 w-1.5 cursor-ew-resize hover:bg-accent/60"
                  title="Drag to change scene length"
                  onPointerDown={(e) => {
                    const start = s.duration;
                    drag(e, (d) => setDoc((doc) => updateScene(doc, s.id, { duration: Math.max(15, start + d) })));
                  }}
                />
              </div>
            );
          })}
        </div>

        {/* Elements of the selected scene */}
        <div className="mt-1 space-y-0.5">
          {scene.elements.map((el) => {
            const w = elementWindow(el, scene.duration);
            const active = el.id === selection.elementId;
            return (
              <div key={el.id} className="relative h-5">
                <div
                  className={`absolute inset-y-0 flex cursor-grab items-center overflow-hidden rounded-sm text-[10px] text-white active:cursor-grabbing ${ELEMENT_COLORS[el.type]} ${
                    active ? "ring-2 ring-white/80" : "opacity-80 hover:opacity-100"
                  }`}
                  style={{ left: pct(sceneTiming.from + w.start), width: pct(w.duration) }}
                  onPointerDown={(e) => {
                    select({ sceneId: scene.id, elementId: el.id });
                    const start = el.start;
                    drag(e, (d) =>
                      setDoc((doc) =>
                        updateElement(doc, scene.id, el.id, { start: Math.min(scene.duration - 1, Math.max(0, start + d)) }),
                      ),
                    );
                  }}
                >
                  <span className="truncate px-1.5">{el.name || el.type}</span>
                  <div
                    className="absolute inset-y-0 right-0 w-1.5 cursor-ew-resize hover:bg-white/50"
                    title="Drag to change duration"
                    onPointerDown={(e) => {
                      select({ sceneId: scene.id, elementId: el.id });
                      const len = w.duration;
                      drag(e, (d) =>
                        setDoc((doc) =>
                          updateElement(doc, scene.id, el.id, { duration: Math.max(1, Math.min(scene.duration - el.start, len + d)) }),
                        ),
                      );
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {/* Playhead */}
        <div className="pointer-events-none absolute top-0 bottom-0 z-20 w-px bg-white" style={{ left: pct(frame) }}>
          <div className="absolute -top-0.5 -left-1 h-2 w-2 rotate-45 bg-white" />
        </div>
      </div>
    </div>
  );
}
