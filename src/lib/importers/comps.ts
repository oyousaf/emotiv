/**
 * Composition discovery for After Effects exports, so the user can pick
 * which comp to rebuild. Pure and browser-safe: the import panel runs it on
 * the dropped file before anything is uploaded.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
type Json = any;

export type CompLayerInfo = { name: string; type: string };

export type CompInfo = {
  /** "root" for the main comp, otherwise the precomp's asset id (Lottie) or an index (AEP). */
  id: string;
  name: string;
  width: number | null;
  height: number | null;
  fps: number | null;
  durationSeconds: number | null;
  /** Layer counts by kind, e.g. { text: 3, shape: 5 }. */
  counts: Record<string, number>;
  layers: CompLayerInfo[];
  fonts: string[];
  /** The first few text strings, to help recognise the comp. */
  texts: string[];
  /** How many other comps use this one. */
  usedBy: number;
  backgroundColor: string | null;
};

const LOTTIE_TYPES: Record<number, string> = { 0: "precomp", 1: "solid", 2: "image", 3: "null", 4: "shape", 5: "text", 6: "audio", 13: "camera" };

function lottieLayers(layers: Json[]) {
  const counts: Record<string, number> = {};
  const texts: string[] = [];
  const fonts = new Set<string>();
  const list: CompLayerInfo[] = [];
  for (const l of layers ?? []) {
    const type = LOTTIE_TYPES[l.ty] ?? "other";
    counts[type] = (counts[type] ?? 0) + 1;
    list.push({ name: String(l.nm ?? type), type });
    const doc = l.t?.d?.k?.[0]?.s;
    if (type === "text" && doc) {
      if (typeof doc.t === "string" && texts.length < 4) texts.push(doc.t.replace(/[\r\u0003]/g, " ").trim());
      if (doc.f) fonts.add(String(doc.f));
    }
  }
  return { counts, texts, fonts: [...fonts], layers: list };
}

/** Every composition in a Bodymovin export: the main comp first, then precomps. */
export function listLottieComps(root: Json): CompInfo[] {
  const fr = Number(root.fr) || null;
  const assets: Json[] = (root.assets ?? []).filter((a: Json) => Array.isArray(a.layers));
  const allLayers = [root.layers ?? [], ...assets.map((a) => a.layers)].flat();
  const refs = (id: string) => allLayers.filter((l: Json) => l.ty === 0 && l.refId === id);
  const main = lottieLayers(root.layers);
  const comps: CompInfo[] = [
    {
      id: "root",
      name: String(root.nm || "Main comp"),
      width: root.w ?? null,
      height: root.h ?? null,
      fps: fr,
      durationSeconds: fr ? (root.op - root.ip) / fr : null,
      ...main,
      usedBy: 0,
      backgroundColor: null,
    },
  ];
  for (const a of assets) {
    const users = refs(a.id);
    const span = users.length ? Math.max(...users.map((u: Json) => u.op - u.ip)) : Math.max(0, ...a.layers.map((l: Json) => l.op ?? 0));
    comps.push({
      id: String(a.id),
      name: String(a.nm || users[0]?.nm || a.id),
      width: a.w ?? users[0]?.w ?? root.w ?? null,
      height: a.h ?? users[0]?.h ?? root.h ?? null,
      fps: fr,
      durationSeconds: fr ? span / fr : null,
      ...lottieLayers(a.layers),
      usedBy: users.length,
      backgroundColor: null,
    });
  }
  return comps;
}

/**
 * A precomp promoted to a standalone animation, so it can be imported on its
 * own. Assets (nested precomps, images, fonts) are kept.
 */
export function extractLottieComp(root: Json, compId: string): Json {
  if (compId === "root") return root;
  const asset = (root.assets ?? []).find((a: Json) => String(a.id) === compId && Array.isArray(a.layers));
  if (!asset) throw new Error(`No composition "${compId}" in this file.`);
  const info = listLottieComps(root).find((c) => c.id === compId)!;
  const fr = Number(root.fr) || 30;
  return {
    ...root,
    nm: info.name,
    w: info.width ?? root.w,
    h: info.height ?? root.h,
    ip: 0,
    op: Math.max(1, Math.round((info.durationSeconds ?? 1) * fr)),
    // Precomp time starts at its own zero, regardless of where it sat in the parent.
    layers: asset.layers,
    markers: [],
  };
}
