import type { CompInfo, CompLayerInfo } from "./comps";

/**
 * Reads the composition list out of an After Effects project, so the user
 * can pick which comp to rebuild. Both formats share one tree:
 *
 *  - .aep is RIFX: big-endian chunks; "LIST" chunks hold children. Project
 *    items are LIST "Item"; a comp has a "cdta" chunk, its name is in a
 *    "Utf8" chunk and its layers are LIST "Layr".
 *  - .aepx is the same tree as XML: LIST types become elements, binary
 *    chunks carry hex in a `bdata` attribute and Utf8 becomes <string>.
 *
 * Names and layer lists are structural and reliable. Size, frame rate,
 * duration and colour come from fixed offsets in "cdta" (as documented by
 * open-source AEP parsers) and are only reported when they look plausible.
 */

type Node = { id: string; children?: Node[]; data?: Uint8Array; text?: string };

const MAX_DEPTH = 64;
const utf8 = new TextDecoder("utf-8");

// ------------------------------------------------------------------- .aep

function readRifx(bytes: Uint8Array): Node {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (p: number) => String.fromCharCode(bytes[p], bytes[p + 1], bytes[p + 2], bytes[p + 3]);
  if (bytes.length < 12 || tag(0) !== "RIFX") throw new Error("Not an After Effects project (no RIFX header).");
  const walk = (start: number, end: number, depth: number): Node[] => {
    const out: Node[] = [];
    let p = start;
    while (p + 8 <= end) {
      const id = tag(p);
      const size = view.getUint32(p + 4, false);
      const data = p + 8;
      if (data + size > end) break;
      if (id === "LIST" && size >= 4) {
        out.push({ id: tag(data), children: depth < MAX_DEPTH ? walk(data + 4, data + size, depth + 1) : [] });
      } else {
        out.push({ id, data: bytes.subarray(data, data + size) });
      }
      p = data + size + (size % 2);
    }
    return out;
  };
  return { id: "root", children: walk(12, Math.min(bytes.length, 8 + view.getUint32(4, false)), 0) };
}

// ------------------------------------------------------------------ .aepx

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.replace(/[^0-9a-f]/gi, "");
  const out = new Uint8Array(clean.length >> 1);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.substr(i * 2, 2), 16);
  return out;
}

const decodeEntities = (s: string) =>
  s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&amp;/g, "&");

function readAepx(xml: string): Node {
  const root: Node = { id: "root", children: [] };
  const stack: Node[] = [root];
  const re = /<(\/?)([A-Za-z_][\w.-]*)([^>]*?)(\/?)>|([^<]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const [, closing, name, attrs, selfClosing, text] = m;
    const top = stack[stack.length - 1];
    if (text !== undefined) {
      if (top.id === "string" && text.trim()) top.text = (top.text ?? "") + decodeEntities(text);
      continue;
    }
    if (name.startsWith("?") || name.startsWith("!")) continue;
    if (closing) {
      if (stack.length > 1 && top.id === name) stack.pop();
      continue;
    }
    const bdata = /bdata="([^"]*)"/.exec(attrs)?.[1];
    const node: Node = { id: name, children: [] };
    if (bdata) node.data = hexToBytes(bdata);
    top.children!.push(node);
    if (!selfClosing && stack.length < MAX_DEPTH) stack.push(node);
  }
  // <string> plays the role of the Utf8 chunk.
  const fix = (n: Node) => {
    if (n.id === "string") {
      n.id = "Utf8";
      n.data = new TextEncoder().encode(n.text ?? "");
    }
    n.children?.forEach(fix);
  };
  fix(root);
  return root;
}

// ------------------------------------------------------------- shared tree

const childData = (n: Node, id: string) => n.children?.find((c) => c.id === id)?.data;
const nameOf = (n: Node) => {
  const d = childData(n, "Utf8");
  return d ? utf8.decode(d).replace(/\0/g, "").trim() : "";
};

function* descendants(n: Node, depth = 0): Generator<Node> {
  if (depth > MAX_DEPTH) return;
  for (const c of n.children ?? []) {
    yield c;
    yield* descendants(c, depth + 1);
  }
}

/** Text layers carry a "btdk" text document; pull out the first string. */
function textFromLayer(layer: Node): string | null {
  for (const d of descendants(layer)) {
    if (d.id !== "btdk" || !d.data) continue;
    const raw = d.data;
    const marker = [0x2f, 0x54, 0x65, 0x78, 0x74]; // "/Text"
    for (let i = 0; i < raw.length - 8; i++) {
      if (marker.every((b, j) => raw[i + j] === b)) {
        // Strings are "(" + UTF-16BE with a FE FF byte-order mark + ")".
        let p = i + 5;
        while (p < raw.length && raw[p] !== 0x28) p++;
        if (raw[p + 1] === 0xfe && raw[p + 2] === 0xff) {
          let s = "";
          for (let q = p + 3; q + 1 < raw.length; q += 2) {
            if (raw[q] === 0x00 && raw[q + 1] === 0x29) break; // ")"
            if (raw[q] === 0x5c) q++; // escaped byte
            s += String.fromCharCode((raw[q] << 8) | raw[q + 1]);
          }
          return s.replace(/\r/g, " ").trim() || null;
        }
      }
    }
    return null;
  }
  return null;
}

function layerType(layer: Node): string {
  const ids = new Set([...descendants(layer)].map((d) => d.id));
  if (ids.has("btdk")) return "text";
  if (ids.has("shph") || ids.has("ADBE Root Vectors Group")) return "shape";
  return "layer";
}

function u16(d: Uint8Array, o: number) {
  return o + 2 <= d.length ? (d[o] << 8) | d[o + 1] : NaN;
}
function u32(d: Uint8Array, o: number) {
  return o + 4 <= d.length ? ((d[o] << 24) >>> 0) + (d[o + 1] << 16) + (d[o + 2] << 8) + d[o + 3] : NaN;
}
const plausible = (n: number, lo: number, hi: number) => Number.isFinite(n) && n >= lo && n <= hi;

/** Size, rate, duration and colour from a comp's "cdta" chunk, if they look sane. */
export function readCdta(d: Uint8Array | undefined) {
  const out = { width: null as number | null, height: null as number | null, fps: null as number | null, durationSeconds: null as number | null, backgroundColor: null as string | null };
  if (!d) return out;
  const w = u16(d, 140);
  const h = u16(d, 142);
  if (plausible(w, 4, 30000) && plausible(h, 4, 30000)) {
    out.width = w;
    out.height = h;
  }
  const fpsDivisor = u32(d, 5);
  const fpsDividend = u32(d, 9);
  const fps = fpsDividend / fpsDivisor;
  if (plausible(fps, 1, 240)) out.fps = Math.round(fps * 1000) / 1000;
  else if (plausible(u16(d, 156), 1, 240)) out.fps = u16(d, 156);
  const dur = u32(d, 45) / u32(d, 49);
  if (plausible(dur, 0.04, 36000)) out.durationSeconds = Math.round(dur * 1000) / 1000;
  if (d.length >= 56) out.backgroundColor = "#" + [d[53], d[54], d[55]].map((b) => b.toString(16).padStart(2, "0")).join("");
  return out;
}

function compsFromTree(root: Node): CompInfo[] {
  const items = [...descendants(root)].filter((n) => n.id === "Item" && childData(n, "cdta"));
  const comps: CompInfo[] = items.map((item, i) => {
    const layers: CompLayerInfo[] = [];
    const texts: string[] = [];
    const counts: Record<string, number> = {};
    for (const layer of item.children?.filter((c) => c.id === "Layr") ?? []) {
      const type = layerType(layer);
      counts[type] = (counts[type] ?? 0) + 1;
      layers.push({ name: nameOf(layer), type });
      const t = type === "text" ? textFromLayer(layer) : null;
      if (t && texts.length < 4) texts.push(t);
    }
    return { id: String(i), name: nameOf(item) || `Comp ${i + 1}`, ...readCdta(childData(item, "cdta")), counts, layers, fonts: [], texts, usedBy: 0 };
  });
  // A comp used inside another shows up as a layer named after it.
  for (const c of comps) c.usedBy = comps.filter((o) => o !== c && o.layers.some((l) => l.name === c.name)).length;
  return comps;
}

export function listAepComps(file: ArrayBuffer | Uint8Array): CompInfo[] {
  return compsFromTree(readRifx(file instanceof Uint8Array ? file : new Uint8Array(file)));
}

export function listAepxComps(xml: string): CompInfo[] {
  return compsFromTree(readAepx(xml));
}
