"use client";

import { Player, type PlayerRef } from "@remotion/player";
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { Main } from "@/remotion/Main";
import { buildCompositionProps, editorAssetUrl } from "@/lib/props";
import { FORMATS, type FormatId } from "@/lib/schema";
import { framesToTimecode, getSceneTimings, getTotalDuration } from "@/lib/timeline";
import { sceneAtFrame } from "@/lib/doc-ops";
import { useEditor } from "./context";
import { Timeline } from "./Timeline";

/** Largest box with the given aspect ratio that fits the container. */
function useFit(ref: RefObject<HTMLDivElement | null>, w: number, h: number) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      const scale = Math.min(width / w, height / h);
      setSize({ width: Math.floor(w * scale), height: Math.floor(h * scale) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref, w, h]);
  return size;
}

export function Preview({ playerRef }: { playerRef: RefObject<PlayerRef | null> }) {
  const { doc, setDoc, assets, select, selection } = useEditor();
  const { width, height } = FORMATS[doc.format];
  const duration = getTotalDuration(doc);
  const [showRef, setShowRef] = useState(true);
  const inputProps = useMemo(
    () => ({ ...buildCompositionProps(doc, assets, editorAssetUrl), showReference: showRef }),
    [doc, assets, showRef],
  );
  const stage = useRef<HTMLDivElement>(null);
  const fit = useFit(stage, width, height);
  const ready = fit.width > 0;
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [loop, setLoop] = useState(true);
  const followRef = useRef({ doc, select, selection });
  followRef.current = { doc, select, selection };

  useEffect(() => {
    const p = playerRef.current;
    if (!p) return;
    const onFrame = (e: { detail: { frame: number } }) => {
      setFrame(e.detail.frame);
      // While playing, follow along in the scene list.
      if (p.isPlaying()) {
        const { doc, select, selection } = followRef.current;
        const id = sceneAtFrame(doc, e.detail.frame);
        if (id && id !== selection.sceneId) select({ sceneId: id, elementId: null });
      }
    };
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    p.addEventListener("frameupdate", onFrame);
    p.addEventListener("seeked", onFrame);
    p.addEventListener("play", onPlay);
    p.addEventListener("pause", onPause);
    p.addEventListener("ended", onPause);
    return () => {
      p.removeEventListener("frameupdate", onFrame);
      p.removeEventListener("seeked", onFrame);
      p.removeEventListener("play", onPlay);
      p.removeEventListener("pause", onPause);
      p.removeEventListener("ended", onPause);
    };
    // The player instance is recreated when the format changes.
  }, [playerRef, doc.format, ready]);

  const step = (d: number) => {
    const p = playerRef.current;
    if (!p) return;
    p.pause();
    p.seekTo(Math.min(duration - 1, Math.max(0, p.getCurrentFrame() + d)));
  };

  const jumpScene = (d: number) => {
    const timings = getSceneTimings(doc);
    const current = playerRef.current?.getCurrentFrame() ?? 0;
    const starts = timings.map((t) => t.from);
    const target =
      d > 0 ? starts.find((s) => s > current) : [...starts].reverse().find((s) => s < current - 2);
    playerRef.current?.seekTo(target ?? (d > 0 ? duration - 1 : 0));
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input, textarea, select, button")) return;
      if (e.code === "Space") {
        e.preventDefault();
        playerRef.current?.toggle();
      } else if (e.key === "ArrowLeft") step(e.shiftKey ? -10 : -1);
      else if (e.key === "ArrowRight") step(e.shiftKey ? 10 : 1);
      else if (e.key === "Home") playerRef.current?.seekTo(0);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const setFormat = (format: FormatId) => setDoc((d) => ({ ...d, format }));

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div ref={stage} className="relative flex min-h-0 flex-1 items-center justify-center p-6">
        {ready ? (
          <div className="overflow-hidden rounded-md shadow-[0_0_0_1px_var(--color-ink-700),0_20px_60px_-20px_#000]" style={fit}>
            <Player
              key={doc.format}
              ref={playerRef}
              component={Main}
              inputProps={inputProps}
              durationInFrames={duration}
              compositionWidth={width}
              compositionHeight={height}
              fps={doc.fps}
              style={{ width: fit.width, height: fit.height }}
              loop={loop}
              clickToPlay
              doubleClickToFullscreen
              acknowledgeRemotionLicense
              initiallyMuted={muted}
            />
          </div>
        ) : null}
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-1 border-t border-ink-800 bg-ink-900 px-3 py-2">
        <button className="btn btn-ghost btn-icon" title="Previous scene" onClick={() => jumpScene(-1)}>
          ⏮
        </button>
        <button className="btn btn-ghost btn-icon" title="Back one frame (←)" onClick={() => step(-1)}>
          ◂
        </button>
        <button
          className="btn btn-icon w-9 border-ink-500!"
          title="Play / pause (Space)"
          onClick={() => playerRef.current?.toggle()}
        >
          {playing ? "❚❚" : "▶"}
        </button>
        <button className="btn btn-ghost btn-icon" title="Forward one frame (→)" onClick={() => step(1)}>
          ▸
        </button>
        <button className="btn btn-ghost btn-icon" title="Next scene" onClick={() => jumpScene(1)}>
          ⏭
        </button>
        <span className="ml-2 font-mono text-xs text-ink-300 tabular-nums">
          {framesToTimecode(frame, doc.fps)} <span className="text-ink-600">/</span> {framesToTimecode(duration, doc.fps)}
        </span>
        <span className="ml-1 font-mono text-[11px] text-ink-600 tabular-nums">f{frame}</span>
        <div className="ml-auto flex items-center gap-1">
          {doc.reference ? (
            <div className="mr-2 flex items-center gap-1.5" title="Tracing overlay of the original video (never exported)">
              <button
                className={`btn btn-ghost btn-icon text-xs ${showRef ? "text-accent" : "text-ink-500"}`}
                onClick={() => setShowRef((s) => !s)}
              >
                ◐ Ref
              </button>
              {showRef ? (
                <input
                  type="range"
                  className="w-20"
                  min={0.05}
                  max={1}
                  step={0.05}
                  value={doc.reference.opacity}
                  onChange={(e) =>
                    setDoc((d) => (d.reference ? { ...d, reference: { ...d.reference, opacity: Number(e.target.value) } } : d))
                  }
                />
              ) : null}
            </div>
          ) : null}
          <button
            className={`btn btn-ghost btn-icon text-xs ${loop ? "text-accent" : "text-ink-500"}`}
            title="Loop playback"
            onClick={() => setLoop((l) => !l)}
          >
            ⟲ Loop
          </button>
          <button
            className="btn btn-ghost btn-icon text-xs"
            title="Mute preview"
            onClick={() => {
              if (muted) playerRef.current?.unmute();
              else playerRef.current?.mute();
              setMuted(!muted);
            }}
          >
            {muted ? "🔇" : "🔊"}
          </button>
          <div className="ml-2 flex rounded-md border border-ink-600 p-0.5 text-xs">
            {(Object.keys(FORMATS) as FormatId[]).map((f) => (
              <button
                key={f}
                onClick={() => setFormat(f)}
                title={FORMATS[f].label}
                className={`rounded px-2.5 py-0.5 ${doc.format === f ? "bg-ink-700 text-white" : "text-ink-400 hover:text-ink-200"}`}
              >
                {f === "landscape" ? "16:9" : "9:16"}
              </button>
            ))}
          </div>
          <button
            className="btn btn-ghost btn-icon text-xs"
            title="Fullscreen"
            onClick={() => playerRef.current?.requestFullscreen()}
          >
            ⛶
          </button>
        </div>
      </div>

      <Timeline frame={frame} duration={duration} />
    </div>
  );
}
