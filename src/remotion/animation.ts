import { Easing, interpolate, spring } from "remotion";
import type { AnimationIn, AnimationOut, AnimationPreset, EasingName } from "../lib/schema";

/**
 * Pure animation maths. Every preset is described by the "hidden" state it
 * animates from (in) or to (out); the visible state is the identity. Keeping
 * this free of React makes it easy to test and to reuse for any element type.
 */
export type AnimState = {
  opacity: number;
  x: number;
  y: number;
  /** Translate in % of the element's own height (used by mask reveals). */
  yPct: number;
  scale: number;
  scaleX: number;
  rotate: number;
  blur: number;
  letterSpacing: number;
  /** 0..1 share of characters shown (typewriter). */
  reveal: number;
};

export const IDENTITY: AnimState = {
  opacity: 1,
  x: 0,
  y: 0,
  yPct: 0,
  scale: 1,
  scaleX: 1,
  rotate: 0,
  blur: 0,
  letterSpacing: 0,
  reveal: 1,
};

export function hiddenState(preset: AnimationPreset, distance: number): Partial<AnimState> {
  switch (preset) {
    case "none":
      return {};
    case "fade":
      return { opacity: 0 };
    case "slideUp":
      return { opacity: 0, y: distance };
    case "slideDown":
      return { opacity: 0, y: -distance };
    case "slideLeft":
      return { opacity: 0, x: distance };
    case "slideRight":
      return { opacity: 0, x: -distance };
    case "scale":
      return { opacity: 0, scale: 0.6 };
    case "pop":
      return { opacity: 0, scale: 0 };
    case "blur":
      return { opacity: 0, blur: 24, scale: 1.08 };
    case "maskUp":
      return { yPct: 110 };
    case "tracking":
      return { opacity: 0, letterSpacing: 0.6, blur: 8 };
    case "rotate":
      return { opacity: 0, rotate: -12, scale: 0.8, y: distance / 2 };
    case "wipeRight":
      return { scaleX: 0 };
    case "typewriter":
      return { reveal: 0 };
  }
}

/** Presets that need an overflow-hidden wrapper around each unit. */
export const usesMask = (preset: AnimationPreset) => preset === "maskUp";

const EASING_FNS: Record<Exclude<EasingName, "spring">, (t: number) => number> = {
  linear: Easing.linear,
  easeOut: Easing.out(Easing.cubic),
  easeInOut: Easing.inOut(Easing.cubic),
  back: Easing.out(Easing.back(1.7)),
};

/** Eased progress 0..1 of an animation that starts at `start` and lasts `duration`. */
export function progress(
  frame: number,
  start: number,
  duration: number,
  easing: EasingName,
  fps: number,
): number {
  if (duration <= 0) return frame >= start ? 1 : 0;
  if (easing === "spring") {
    return spring({
      frame: frame - start,
      fps,
      durationInFrames: duration,
      config: { damping: 12, stiffness: 140, mass: 0.6 },
    });
  }
  const linear = interpolate(frame, [start, start + duration], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return EASING_FNS[easing](linear);
}

function mix(hidden: Partial<AnimState>, t: number): AnimState {
  const out = { ...IDENTITY };
  for (const key of Object.keys(hidden) as (keyof AnimState)[]) {
    const from = hidden[key] as number;
    out[key] = from + (IDENTITY[key] - from) * t;
  }
  // Springs and back easing overshoot; opacity and reveal must not.
  out.opacity = Math.min(1, Math.max(0, out.opacity));
  out.reveal = Math.min(1, Math.max(0, out.reveal));
  return out;
}

export function combine(a: AnimState, b: AnimState): AnimState {
  return {
    opacity: a.opacity * b.opacity,
    x: a.x + b.x,
    y: a.y + b.y,
    yPct: a.yPct + b.yPct,
    scale: a.scale * b.scale,
    scaleX: a.scaleX * b.scaleX,
    rotate: a.rotate + b.rotate,
    blur: a.blur + b.blur,
    letterSpacing: a.letterSpacing + b.letterSpacing,
    reveal: Math.min(a.reveal, b.reveal),
  };
}

export type UnitTiming = { index: number; count: number };

/**
 * State of one animated unit (the whole element, or a word/char/line of a
 * split text) at `frame`, where frame 0 is the element's first frame.
 */
export function animState(opts: {
  frame: number;
  fps: number;
  elementDuration: number;
  animIn: AnimationIn;
  animOut: AnimationOut;
  unit?: UnitTiming;
}): AnimState {
  const { frame, fps, elementDuration, animIn, animOut, unit } = opts;
  const staggerOffset = unit ? unit.index * animIn.stagger : 0;
  const inStart = animIn.delay + staggerOffset;
  const pIn = animIn.preset === "none" ? 1 : progress(frame, inStart, animIn.duration, animIn.easing, fps);
  const stateIn = mix(hiddenState(animIn.preset, animIn.distance), pIn);

  if (animOut.preset === "none") return stateIn;
  const outStart = elementDuration - animOut.duration;
  const pOut = progress(frame, outStart, animOut.duration, animOut.easing, fps);
  const stateOut = mix(hiddenState(animOut.preset, animOut.distance), 1 - pOut);
  return combine(stateIn, stateOut);
}

/** Total frames until the last unit of a split text has finished animating in. */
export function inAnimationLength(animIn: AnimationIn, units: number): number {
  return animIn.delay + animIn.duration + Math.max(0, units - 1) * animIn.stagger;
}

export function loopState(mode: string, frame: number, fps: number): Partial<AnimState> {
  const t = frame / fps;
  switch (mode) {
    case "float":
      return { y: Math.sin(t * Math.PI) * 10 };
    case "pulse":
      return { scale: 1 + Math.sin(t * Math.PI * 2) * 0.03 };
    case "flicker": {
      // Deterministic pseudo-random flicker so renders are reproducible.
      const n = Math.sin(frame * 12.9898) * 43758.5453;
      const r = n - Math.floor(n);
      return { opacity: r > 0.92 ? 0.35 : 1 };
    }
    default:
      return {};
  }
}

export function toTransform(s: AnimState): string {
  const parts: string[] = [];
  if (s.x || s.y) parts.push(`translate(${s.x}px, ${s.y}px)`);
  if (s.yPct) parts.push(`translateY(${s.yPct}%)`);
  if (s.rotate) parts.push(`rotate(${s.rotate}deg)`);
  if (s.scale !== 1) parts.push(`scale(${s.scale})`);
  if (s.scaleX !== 1) parts.push(`scaleX(${s.scaleX})`);
  return parts.join(" ") || "none";
}

export function splitText(text: string, mode: AnimationIn["split"]): string[] {
  switch (mode) {
    case "words":
      // Keep whitespace attached so wrapping still works.
      return text.match(/\S+\s*/g) ?? [];
    case "chars":
      return Array.from(text);
    case "lines":
      return text.split("\n");
    default:
      return [text];
  }
}
