import {
  animationIn,
  animationOut,
  lottieElement,
  projectDoc,
  type AnimationIn,
  type AnimationOut,
  type FormatId,
  type ProjectDoc,
  type Scene,
  type SceneElement,
} from "../schema";
import { newId, shape, text } from "../templates";

/**
 * Converts a Bodymovin/Lottie export (After Effects → JSON) into an emotiv
 * project. Two modes:
 *
 * - "hybrid": text layers and simple solids/rects become editable emotiv
 *   layers with the closest animation preset; everything else (shape
 *   animation, images, nested precomps) stays pixel-exact in a "graphics"
 *   Lottie layer underneath.
 * - "exact": the whole animation plays as-is in a Lottie layer.
 *
 * A master comp built from sequenced precomps (the usual AE structure) is
 * split into one scene per precomp.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
type Json = any;
type Keyframe = { t: number; s?: number[] | number; e?: number[] | number; h?: number; i?: Json; o?: Json };
type Prop = { a?: number; k: Json; s?: boolean; x?: Prop; y?: Prop } | undefined;

export const GRAPHICS_PLACEHOLDER = "__graphics__";
export const SOURCE_PLACEHOLDER = "__source__";

export type LottieImportReport = {
  scenes: number;
  textLayers: number;
  shapeLayers: number;
  backgrounds: number;
  keptAsGraphics: number;
  fonts: { family: string; found: boolean }[];
  notes: string[];
};

export type LottieImportResult = {
  doc: ProjectDoc;
  /** Lottie JSON with the converted layers removed, or null if nothing is left. */
  graphics: Json | null;
  report: LottieImportReport;
};

// ------------------------------------------------------------------ values

const num = (v: Json, i = 0): number => (Array.isArray(v) ? Number(v[i] ?? 0) : Number(v ?? 0));

function keyframes(p: Prop): Keyframe[] | null {
  if (!p || p.a !== 1 || !Array.isArray(p.k) || typeof p.k[0] !== "object") return null;
  return p.k as Keyframe[];
}

/** Value of a (possibly animated) property at time t, as an array. */
export function valueAt(p: Prop, t: number): number[] {
  if (!p) return [];
  if (p.s && p.x && p.y) return [valueAt(p.x, t)[0] ?? 0, valueAt(p.y, t)[0] ?? 0];
  const kfs = keyframes(p);
  if (!kfs) return Array.isArray(p.k) ? p.k.map(Number) : [Number(p.k)];
  const arr = (v: Json) => (Array.isArray(v) ? v.map(Number) : [Number(v)]);
  // Older exports put the end value in `e`; newer ones use the next key's `s`.
  const startOf = (i: number) => arr(kfs[i].s ?? kfs[i - 1]?.e ?? 0);
  const endOf = (i: number) => arr(kfs[i].e ?? kfs[i + 1]?.s ?? kfs[i].s ?? 0);
  if (t <= kfs[0].t) return startOf(0);
  for (let i = 0; i < kfs.length - 1; i++) {
    const a = kfs[i];
    const b = kfs[i + 1];
    if (t < b.t) {
      if (a.h) return startOf(i);
      const u = (t - a.t) / (b.t - a.t || 1);
      const from = startOf(i);
      const to = endOf(i);
      return from.map((v, j) => v + ((to[j] ?? v) - v) * u);
    }
  }
  const last = kfs.length - 1;
  return kfs[last].s != null ? startOf(last) : endOf(last - 1);
}

function animTimes(p: Prop): number[] {
  if (p?.s && p.x && p.y) return [...animTimes(p.x), ...animTimes(p.y)].sort((a, b) => a - b);
  return keyframes(p)?.map((k) => k.t) ?? [];
}

const hex = (rgb: number[]) =>
  "#" +
  rgb
    .slice(0, 3)
    .map((c) => Math.round(Math.max(0, Math.min(1, c)) * 255).toString(16).padStart(2, "0"))
    .join("");

const solidHex = (sc: string) => (/^#[0-9a-f]{6}$/i.test(sc) ? sc.toLowerCase() : "#000000");

// ---------------------------------------------------------- animation guess

type Transform = { p: number[]; o: number; s: number; sy: number; r: number };

function transformAt(ks: Json, t: number): Transform {
  return {
    p: valueAt(ks?.p, t),
    o: valueAt(ks?.o, t)[0] ?? 100,
    s: valueAt(ks?.s, t)[0] ?? 100,
    sy: valueAt(ks?.s, t)[1] ?? valueAt(ks?.s, t)[0] ?? 100,
    r: valueAt(ks?.r, t)[0] ?? 0,
  };
}

type Segment = { start: number; end: number };

/**
 * Split a layer's keyframes into an "in" segment near its start and an
 * "out" segment near its end. Times are in source frames.
 */
function segments(ks: Json, ip: number, op: number): { in: Segment | null; out: Segment | null; rest: number } {
  const times = [...new Set(["p", "o", "s", "r"].flatMap((k) => animTimes(ks?.[k])))].sort((a, b) => a - b);
  const mid = ip + (op - ip) / 2;
  const early = times.filter((t) => t <= mid);
  const late = times.filter((t) => t > mid);
  const inSeg = early.length >= 2 ? { start: early[0], end: early[early.length - 1] } : null;
  const outSeg = late.length >= 2 ? { start: late[0], end: late[late.length - 1] } : null;
  const rest = inSeg ? inSeg.end : outSeg ? outSeg.start : ip;
  return { in: inSeg, out: outSeg, rest };
}

function guessPreset(from: Transform, rest: Transform, overshoot: boolean, k: number): { preset: AnimationIn["preset"]; distance: number } {
  const dx = (from.p[0] ?? 0) - (rest.p[0] ?? 0);
  const dy = (from.p[1] ?? 0) - (rest.p[1] ?? 0);
  if (Math.hypot(dx, dy) > 4) {
    const distance = Math.min(2000, Math.round(Math.hypot(dx, dy) * k));
    if (Math.abs(dy) >= Math.abs(dx)) return { preset: dy > 0 ? "slideUp" : "slideDown", distance };
    return { preset: dx > 0 ? "slideLeft" : "slideRight", distance };
  }
  // Width-only scale from nothing is how AE wipes a bar on.
  if (from.s < rest.s * 0.5 && Math.abs(from.sy - rest.sy) < 2) return { preset: "wipeRight", distance: 80 };
  if (from.s < rest.s * 0.95) return { preset: overshoot || from.s < 20 ? "pop" : "scale", distance: 80 };
  if (Math.abs(from.r - rest.r) > 2) return { preset: "rotate", distance: 40 };
  if (from.o < rest.o * 0.6) return { preset: "fade", distance: 80 };
  return { preset: "none", distance: 80 };
}

function overshoots(ks: Json, seg: Segment, rest: Transform): boolean {
  for (let t = seg.start; t <= seg.end; t += Math.max(1, (seg.end - seg.start) / 12)) {
    if (transformAt(ks, t).s > rest.s * 1.03) return true;
  }
  return false;
}

function guessAnimations(ks: Json, ip: number, op: number, toFrames: (f: number) => number, k: number) {
  const seg = segments(ks, ip, op);
  const rest = transformAt(ks, seg.rest);
  let animIn: AnimationIn = animationIn.parse({ preset: "none" });
  let animOut: AnimationOut = animationOut.parse({ preset: "none" });
  if (seg.in) {
    const from = transformAt(ks, seg.in.start);
    const over = overshoots(ks, seg.in, rest);
    const g = guessPreset(from, rest, over, k);
    animIn = animationIn.parse({
      preset: g.preset,
      distance: g.distance,
      duration: Math.max(1, toFrames(seg.in.end) - toFrames(seg.in.start)),
      delay: Math.max(0, toFrames(seg.in.start) - toFrames(ip)),
      easing: over ? "back" : "easeOut",
    });
  }
  if (seg.out) {
    const to = transformAt(ks, seg.out.end);
    const g = guessPreset(to, rest, false, k);
    animOut = animationOut.parse({
      preset: g.preset === "pop" ? "scale" : g.preset,
      distance: g.distance,
      duration: Math.max(1, toFrames(seg.out.end) - toFrames(seg.out.start)),
      easing: "easeInOut",
    });
  }
  return { animIn, animOut, rest };
}

// ------------------------------------------------------------- conversion

type Ctx = {
  fr: number;
  compW: number;
  compH: number;
  /** px in comp → px on the 1080 short side */
  k: number;
  fonts: Map<string, { family: string; weight: number; italic: boolean }>;
  availableFamilies: string[];
  usedFonts: Map<string, boolean>;
  report: LottieImportReport;
};

const WEIGHTS: [RegExp, number][] = [
  [/thin|hairline/i, 100],
  [/extra ?light|ultra ?light/i, 200],
  [/light/i, 300],
  [/medium/i, 500],
  [/semi ?bold|demi/i, 600],
  [/extra ?bold|ultra ?bold/i, 800],
  [/black|heavy/i, 900],
  [/bold/i, 700],
];

function resolveFont(ctx: Ctx, fName: string) {
  const f = ctx.fonts.get(fName) ?? { family: fName.replace(/[-_ ]?(regular|bold|italic|light|medium|black).*$/i, "") || fName, weight: 400, italic: false };
  const clean = f.family.replace(/[^A-Za-z0-9 _-]/g, " ").trim().slice(0, 64) || "Arial";
  const match = ctx.availableFamilies.find(
    (a) => a.toLowerCase() === clean.toLowerCase() || a.toLowerCase() === fName.toLowerCase().replace(/-regular$/, ""),
  );
  ctx.usedFonts.set(match ?? clean, !!match);
  return { family: match ?? clean, weight: f.weight, italic: f.italic };
}

/** Sum of parent offsets, for layers parented to (typically) nulls. */
function parentOffset(layers: Json[], layer: Json, t: number, depth = 0): number[] {
  if (layer.parent == null || depth > 8) return [0, 0];
  const parent = layers.find((l) => l.ind === layer.parent);
  if (!parent) return [0, 0];
  const p = valueAt(parent.ks?.p, t);
  const a = valueAt(parent.ks?.a, t);
  const up = parentOffset(layers, parent, t, depth + 1);
  return [(p[0] ?? 0) - (a[0] ?? 0) + up[0], (p[1] ?? 0) - (a[1] ?? 0) + up[1]];
}

function convertText(layer: Json, layers: Json[], ctx: Ctx, timing: { ip: number; op: number; toFrames: (f: number) => number; sceneStart: number }): SceneElement | null {
  const doc = layer.t?.d?.k?.[0]?.s;
  if (!doc || typeof doc.t !== "string") return null;
  const { animIn, animOut, rest } = guessAnimations(layer.ks, timing.ip, timing.op, timing.toFrames, ctx.k);
  const font = resolveFont(ctx, String(doc.f ?? "Arial"));
  const scale = rest.s / 100;
  const fontSize = Math.max(4, Math.min(800, Math.round(num(doc.s, 0) * scale * ctx.k)));
  const off = parentOffset(layers, layer, timing.ip);
  const anchor = valueAt(layer.ks?.a, timing.ip);
  const px = (rest.p[0] ?? ctx.compW / 2) - (anchor[0] ?? 0) * scale + off[0];
  const py = (rest.p[1] ?? ctx.compH / 2) - (anchor[1] ?? 0) * scale + off[1];
  const align = doc.j === 0 ? "left" : doc.j === 1 ? "right" : "center";
  const lines = String(doc.t).split(/\r\n|\r|\n|\u0003/);
  const lineHeightPx = num(doc.lh, 0) || num(doc.s, 0) * 1.2;
  // Lottie positions text by its first baseline; emotiv positions by box centre.
  const blockH = lineHeightPx * lines.length * scale;
  const centreY = py - num(doc.s, 0) * 0.8 * scale + blockH / 2;
  let widthPct = 80;
  let xPct = (px / ctx.compW) * 100;
  if (Array.isArray(doc.sz)) {
    widthPct = Math.min(200, (num(doc.sz, 0) * scale / ctx.compW) * 100);
    const ps = doc.ps ?? [0, 0];
    xPct = ((px + (num(ps, 0) + num(doc.sz, 0) / 2) * scale) / ctx.compW) * 100;
  } else if (align === "left") xPct += widthPct / 2;
  else if (align === "right") xPct -= widthPct / 2;

  // Text animators with a range selector → per-unit stagger.
  const animator = layer.t?.a?.[0];
  if (animator && animIn.preset === "none") {
    const sel = animator.s ?? {};
    const basis = sel.b === 3 ? "words" : sel.b === 4 ? "lines" : "chars";
    const units = basis === "words" ? lines.join(" ").split(/\s+/).length : basis === "lines" ? lines.length : lines.join("").length;
    const times = [...animTimes(sel.s), ...animTimes(sel.e), ...animTimes(sel.o)];
    if (times.length >= 2) {
      const span = timing.toFrames(Math.max(...times)) - timing.toFrames(Math.min(...times));
      const props = animator.a ?? {};
      const preset: AnimationIn["preset"] = props.p ? "slideUp" : props.s ? "pop" : props.t ? "tracking" : "fade";
      const stagger = Math.max(1, Math.min(20, Math.round(span / Math.max(1, units))));
      Object.assign(animIn, {
        preset,
        split: basis,
        stagger,
        duration: Math.max(6, Math.min(30, stagger * 4)),
        delay: Math.max(0, timing.toFrames(Math.min(...times)) - timing.toFrames(timing.ip)),
        distance: props.p ? Math.min(2000, Math.round(Math.abs(num(valueAt(props.p, 0), 1)) * ctx.k)) || 60 : 80,
      });
    }
  }
  // A text layer revealed through a track matte is AE's classic mask reveal.
  if (layer.tt && animIn.preset === "slideUp") animIn.preset = "maskUp";

  ctx.report.textLayers++;
  return text({
    name: String(layer.nm ?? "Text").slice(0, 80),
    text: lines.join("\n").slice(0, 2000),
    x: round1(xPct),
    y: round1((centreY / ctx.compH) * 100),
    width: round1(Math.max(1, widthPct)),
    rotation: Math.max(-360, Math.min(360, rest.r)),
    opacity: Math.max(0, Math.min(1, rest.o / 100)),
    start: Math.max(0, timing.toFrames(timing.ip) - timing.sceneStart),
    duration: Math.max(1, timing.toFrames(timing.op) - timing.toFrames(timing.ip)),
    fontFamily: font.family,
    fontWeight: font.weight,
    italic: font.italic,
    fontSize,
    color: Array.isArray(doc.fc) ? hex(doc.fc) : "#ffffff",
    strokeColor: Array.isArray(doc.sc) ? hex(doc.sc) : "#000000",
    strokeWidth: doc.sc && doc.sw ? Math.min(40, Math.round(num(doc.sw) * ctx.k)) : 0,
    align,
    letterSpacing: Math.max(-0.5, Math.min(2, num(doc.tr) / 1000)),
    lineHeight: Math.max(0.5, Math.min(3, lineHeightPx / (num(doc.s, 0) || 1))),
    animIn,
    animOut,
  });
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** A rect/ellipse in comp pixels → an emotiv shape layer. */
function rectToShape(
  layer: Json,
  layers: Json[],
  ctx: Ctx,
  timing: { ip: number; op: number; toFrames: (f: number) => number; sceneStart: number },
  box: { cx: number; cy: number; w: number; h: number; color: string; ellipse: boolean; radius: number },
): SceneElement {
  const { animIn, animOut, rest } = guessAnimations(layer.ks, timing.ip, timing.op, timing.toFrames, ctx.k);
  const scale = rest.s / 100;
  const anchor = valueAt(layer.ks?.a, timing.ip);
  const off = parentOffset(layers, layer, timing.ip);
  const cx = (rest.p[0] ?? 0) + (box.cx - (anchor[0] ?? 0)) * scale + off[0];
  const cy = (rest.p[1] ?? 0) + (box.cy - (anchor[1] ?? 0)) * scale + off[1];
  ctx.report.shapeLayers++;
  return shape({
    name: String(layer.nm ?? "Shape").slice(0, 80),
    shape: box.ellipse ? "ellipse" : "rect",
    x: round1((cx / ctx.compW) * 100),
    y: round1((cy / ctx.compH) * 100),
    width: round1(Math.max(0.1, ((box.w * scale) / ctx.compW) * 100)),
    height: round1(Math.max(0.1, ((box.h * scale) / ctx.compH) * 100)),
    radius: Math.min(1000, Math.round(box.radius * ctx.k)),
    color: box.color,
    rotation: Math.max(-360, Math.min(360, rest.r)),
    opacity: Math.max(0, Math.min(1, rest.o / 100)),
    start: Math.max(0, timing.toFrames(timing.ip) - timing.sceneStart),
    duration: Math.max(1, timing.toFrames(timing.op) - timing.toFrames(timing.ip)),
    animIn,
    animOut,
  });
}

/** A shape layer holding exactly one static rect or ellipse with a solid fill. */
function simpleShape(layer: Json): { cx: number; cy: number; w: number; h: number; color: string; ellipse: boolean; radius: number } | null {
  const items: Json[] = [];
  const walk = (list: Json[]) => {
    for (const it of list ?? []) {
      if (it.ty === "gr") walk(it.it);
      else items.push(it);
    }
  };
  walk(layer.shapes);
  const geo = items.filter((i) => i.ty === "rc" || i.ty === "el");
  const fills = items.filter((i) => i.ty === "fl");
  const other = items.filter((i) => !["rc", "el", "fl", "tr"].includes(i.ty));
  if (geo.length !== 1 || fills.length !== 1 || other.length) return null;
  const g = geo[0];
  if (keyframes(g.s) || keyframes(g.p) || keyframes(fills[0].c)) return null;
  const size = valueAt(g.s, 0);
  const pos = valueAt(g.p, 0);
  return {
    cx: pos[0] ?? 0,
    cy: pos[1] ?? 0,
    w: size[0] ?? 0,
    h: size[1] ?? 0,
    color: hex(valueAt(fills[0].c, 0)),
    ellipse: g.ty === "el",
    radius: g.ty === "rc" ? valueAt(g.r, 0)[0] ?? 0 : 0,
  };
}

// ------------------------------------------------------------------ scenes

type SceneSpan = { name: string; ip: number; op: number; layers: Json[]; st: number; compKey: string; lottieOffset: number };

function sceneSpans(root: Json): SceneSpan[] {
  const top: Json[] = (root.layers ?? []).filter((l: Json) => !l.hd);
  const pre = top.filter((l) => l.ty === 0).sort((a, b) => a.ip - b.ip);
  const total = root.op - root.ip;
  const asset = (id: string) => (root.assets ?? []).find((a: Json) => a.id === id);
  const sequenced =
    pre.length >= 2 &&
    pre.length === top.filter((l) => l.ty !== 3).length &&
    pre.every((l, i) => i === 0 || l.ip >= pre[i - 1].op - Math.min(pre[i - 1].op - pre[i - 1].ip, l.op - l.ip) * 0.3) &&
    pre.reduce((s, l) => s + (l.op - l.ip), 0) >= total * 0.8;
  if (!sequenced) {
    return [{ name: String(root.nm ?? "Imported").slice(0, 80) || "Imported", ip: root.ip, op: root.op, layers: root.layers ?? [], st: 0, compKey: "root", lottieOffset: root.ip }];
  }
  return pre.map((l) => ({
    name: String(l.nm ?? "Scene").slice(0, 80) || "Scene",
    ip: l.ip,
    op: l.op,
    layers: asset(l.refId)?.layers ?? [],
    st: l.st ?? 0,
    compKey: String(l.refId),
    lottieOffset: l.ip,
  }));
}

function fitWidth(lw: number, lh: number, format: FormatId) {
  const fw = format === "landscape" ? 16 : 9;
  const fh = format === "landscape" ? 9 : 16;
  return round1(Math.min(100, ((lw / lh) / (fw / fh)) * 100));
}

export function importLottie(
  root: Json,
  opts: { mode: "hybrid" | "exact"; format?: FormatId; availableFamilies?: string[] },
): LottieImportResult {
  const fr = Number(root.fr) || 30;
  const toFrames = (f: number) => Math.round((f * 30) / fr);
  const format: FormatId = opts.format ?? (root.w >= root.h ? "landscape" : "vertical");
  const report: LottieImportReport = { scenes: 0, textLayers: 0, shapeLayers: 0, backgrounds: 0, keptAsGraphics: 0, fonts: [], notes: [] };
  const fonts = new Map<string, { family: string; weight: number; italic: boolean }>();
  for (const f of root.fonts?.list ?? []) {
    const style = String(f.fStyle ?? "");
    fonts.set(String(f.fName), {
      family: String(f.fFamily ?? f.fName),
      weight: WEIGHTS.find(([re]) => re.test(style))?.[1] ?? 400,
      italic: /italic|oblique/i.test(style),
    });
  }
  const ctx: Ctx = {
    fr,
    compW: root.w,
    compH: root.h,
    k: 1080 / Math.min(root.w, root.h),
    fonts,
    availableFamilies: opts.availableFamilies ?? [],
    usedFonts: new Map(),
    report,
  };
  if (fr !== 30) report.notes.push(`Retimed from ${fr} fps to 30 fps.`);
  if (root.ddd) report.notes.push("The comp uses 3D layers; they're kept in the graphics layer but flattened.");

  const spans = sceneSpans(root);
  const converted = new Map<string, Set<number>>(); // compKey → layer indices removed from graphics
  const markConverted = (compKey: string, layers: Json[], layer: Json) => {
    const set = converted.get(compKey) ?? new Set<number>();
    set.add(layer.ind);
    // A matte applies to the layer below it; drop it together with its target.
    if (layer.tt) {
      const above = layers[layers.indexOf(layer) - 1];
      if (above?.td) set.add(above.ind);
    }
    converted.set(compKey, set);
  };

  const lottieLayer = (assetId: string, offset: number, duration: number): SceneElement =>
    lottieElement.parse({
      id: newId("el"),
      type: "lottie",
      name: assetId === GRAPHICS_PLACEHOLDER ? "Graphics (from After Effects)" : "Original animation",
      assetId,
      x: 50,
      y: 50,
      width: fitWidth(root.w, root.h, format),
      offset,
      duration,
      animIn: { preset: "none" },
      animOut: { preset: "none" },
    });

  const scenes: Scene[] = spans.map((span, i) => {
    const sceneStart = toFrames(span.ip);
    const duration = Math.max(15, toFrames(span.op) - sceneStart);
    const prev = spans[i - 1];
    const overlap = prev ? Math.max(0, toFrames(prev.op) - sceneStart) : 0;
    const scene: Scene = {
      id: newId("sc"),
      name: span.name,
      duration,
      background: { type: "color", color: "#000000" },
      transition: overlap > 0 ? { type: "fade", duration: Math.min(120, overlap) } : { type: "none", duration: 15 },
      elements: [],
    };
    if (opts.mode === "exact") {
      scene.elements.push(lottieLayer(SOURCE_PLACEHOLDER, toFrames(span.lottieOffset), duration));
      return scene;
    }

    // Layer times inside a precomp are local; shift them onto the master timeline.
    const shift = span.compKey === "root" ? 0 : span.st;
    const editable: SceneElement[] = [];
    const visible = span.layers.filter((l) => !l.hd && !l.td);
    for (const layer of [...visible].reverse()) {
      const ip = Math.max(span.ip, layer.ip + shift);
      const op = Math.min(span.op, layer.op + shift);
      if (op <= ip) continue;
      const shiftedKs = shiftTimes(layer.ks, shift);
      const shifted = { ...layer, ks: shiftedKs, t: layer.t ? { ...layer.t, a: shiftAnimators(layer.t.a, shift) } : layer.t };
      const timing = { ip, op, toFrames, sceneStart };
      if (layer.ty === 5) {
        const el = convertText(shifted, span.layers, ctx, timing);
        if (el) {
          editable.push(el);
          markConverted(span.compKey, span.layers, layer);
        }
      } else if (layer.ty === 1) {
        const w = Number(layer.sw) || 0;
        const h = Number(layer.sh) || 0;
        const isBottom = visible[visible.length - 1] === layer;
        const fullFrame = w >= ctx.compW * 0.95 && h >= ctx.compH * 0.95 && !keyframes(layer.ks?.p) && !keyframes(layer.ks?.o);
        if (isBottom && fullFrame && ip <= span.ip + 1) {
          scene.background = { type: "color", color: solidHex(String(layer.sc)) };
          report.backgrounds++;
        } else {
          editable.push(rectToShape(shifted, span.layers, ctx, timing, { cx: w / 2, cy: h / 2, w, h, color: solidHex(String(layer.sc)), ellipse: false, radius: 0 }));
        }
        markConverted(span.compKey, span.layers, layer);
      } else if (layer.ty === 4) {
        const box = simpleShape(layer);
        if (box) {
          editable.push(rectToShape(shifted, span.layers, ctx, timing, box));
          markConverted(span.compKey, span.layers, layer);
        }
      }
    }
    scene.elements = editable.reverse();
    return scene;
  });

  // Whatever wasn't converted stays exact in a graphics Lottie under the edits.
  let graphics: Json | null = null;
  if (opts.mode === "hybrid") {
    const copy = structuredClone(root);
    const strip = (layers: Json[], key: string) => layers.filter((l) => !converted.get(key)?.has(l.ind));
    copy.layers = strip(copy.layers ?? [], "root");
    for (const a of copy.assets ?? []) if (Array.isArray(a.layers)) a.layers = strip(a.layers, String(a.id));
    const renderable = (layers: Json[]): number =>
      layers.filter((l) => !l.hd && !l.td && l.ty !== 3).reduce((n, l) => {
        if (l.ty === 0) {
          const inner = (copy.assets ?? []).find((a: Json) => a.id === l.refId)?.layers ?? [];
          return n + renderable(inner);
        }
        return n + 1;
      }, 0);
    const left = renderable(copy.layers);
    if (left > 0) {
      graphics = copy;
      report.keptAsGraphics = left;
      for (const [i, span] of spans.entries()) {
        const dur = scenes[i].duration;
        scenes[i].elements.unshift(lottieLayer(GRAPHICS_PLACEHOLDER, toFrames(span.lottieOffset), dur));
      }
    }
  }

  report.scenes = scenes.length;
  report.fonts = [...ctx.usedFonts].map(([family, found]) => ({ family, found }));
  const missing = report.fonts.filter((f) => !f.found).map((f) => f.family);
  if (missing.length) report.notes.push(`Upload these fonts to match the original: ${missing.join(", ")}.`);
  if (opts.mode === "hybrid" && report.textLayers === 0) {
    report.notes.push("No live text layers found. If the export used glyphs, re-export from Bodymovin with \"Glyphs\" turned off.");
  }

  return { doc: projectDoc.parse({ fps: 30, format, scenes }), graphics, report };
}

/** Shift every keyframe time in a transform by `dt` frames. */
function shiftTimes(ks: Json, dt: number): Json {
  if (!dt || !ks) return ks;
  const out: Json = {};
  for (const [key, prop] of Object.entries<Json>(ks)) out[key] = shiftProp(prop, dt);
  return out;
}

function shiftProp(p: Json, dt: number): Json {
  if (!p || typeof p !== "object") return p;
  if (p.s && p.x && p.y) return { ...p, x: shiftProp(p.x, dt), y: shiftProp(p.y, dt) };
  if (p.a === 1 && Array.isArray(p.k)) return { ...p, k: p.k.map((kf: Keyframe) => ({ ...kf, t: kf.t + dt })) };
  return p;
}

function shiftAnimators(a: Json, dt: number): Json {
  if (!dt || !Array.isArray(a)) return a;
  return a.map((an) => ({
    ...an,
    s: an.s ? { ...an.s, s: shiftProp(an.s.s, dt), e: shiftProp(an.s.e, dt), o: shiftProp(an.s.o, dt) } : an.s,
  }));
}
