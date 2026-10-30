import fs from "node:fs";
import path from "node:path";
import { ALL_FORMATS, BufferSource, Input } from "mediabunny";
import type { AssetKind } from "../schema";
import { newId } from "../templates";
import type { AssetRecord } from "../types";
import { insertAsset } from "./repo";
import { assetPath, assetsDir } from "./paths";

const MB = 1024 * 1024;

type Rule = { kind: AssetKind; mime: string; maxBytes: number; sniff: (b: Buffer) => boolean };

const ascii = (b: Buffer, offset: number, s: string) => b.subarray(offset, offset + s.length).toString("latin1") === s;
const isFtyp = (b: Buffer) => ascii(b, 4, "ftyp");

/**
 * Allowed uploads, keyed by extension. The extension picks the rule and the
 * file's magic bytes must agree with it, so a renamed file is rejected.
 * SVG is deliberately absent: it can carry script.
 */
export const UPLOAD_RULES: Record<string, Rule> = {
  mp4: { kind: "video", mime: "video/mp4", maxBytes: 1024 * MB, sniff: isFtyp },
  m4v: { kind: "video", mime: "video/mp4", maxBytes: 1024 * MB, sniff: isFtyp },
  png: { kind: "image", mime: "image/png", maxBytes: 50 * MB, sniff: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  jpg: { kind: "image", mime: "image/jpeg", maxBytes: 50 * MB, sniff: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  jpeg: { kind: "image", mime: "image/jpeg", maxBytes: 50 * MB, sniff: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  webp: { kind: "image", mime: "image/webp", maxBytes: 50 * MB, sniff: (b) => ascii(b, 0, "RIFF") && ascii(b, 8, "WEBP") },
  gif: { kind: "image", mime: "image/gif", maxBytes: 50 * MB, sniff: (b) => ascii(b, 0, "GIF87a") || ascii(b, 0, "GIF89a") },
  mp3: {
    kind: "audio",
    mime: "audio/mpeg",
    maxBytes: 200 * MB,
    sniff: (b) => ascii(b, 0, "ID3") || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0),
  },
  wav: { kind: "audio", mime: "audio/wav", maxBytes: 200 * MB, sniff: (b) => ascii(b, 0, "RIFF") && ascii(b, 8, "WAVE") },
  m4a: { kind: "audio", mime: "audio/mp4", maxBytes: 200 * MB, sniff: isFtyp },
  ogg: { kind: "audio", mime: "audio/ogg", maxBytes: 200 * MB, sniff: (b) => ascii(b, 0, "OggS") },
  ttf: {
    kind: "font",
    mime: "font/ttf",
    maxBytes: 20 * MB,
    sniff: (b) => b.subarray(0, 4).equals(Buffer.from([0, 1, 0, 0])) || ascii(b, 0, "true"),
  },
  otf: { kind: "font", mime: "font/otf", maxBytes: 20 * MB, sniff: (b) => ascii(b, 0, "OTTO") },
  woff: { kind: "font", mime: "font/woff", maxBytes: 20 * MB, sniff: (b) => ascii(b, 0, "wOFF") },
  woff2: { kind: "font", mime: "font/woff2", maxBytes: 20 * MB, sniff: (b) => ascii(b, 0, "wOF2") },
};

export const ACCEPT_ATTR = Object.keys(UPLOAD_RULES)
  .map((e) => `.${e}`)
  .join(",");

export class UploadError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

/** Display name only; it never touches the filesystem. */
export function cleanDisplayName(name: string): string {
  const base = path.basename(name.replace(/\\/g, "/"));
  return base.replace(/[\u0000-\u001f<>"]/g, "").slice(0, 120) || "file";
}

/** "Anton-Regular.ttf" → "Anton". Restricted to characters safe inside CSS. */
export function fontFamilyFromName(name: string): string {
  const stem = name.replace(/\.[^.]+$/, "").replace(/[-_ ](regular|normal|book)$/i, "");
  const clean = stem.replace(/[^A-Za-z0-9 _-]/g, " ").replace(/\s+/g, " ").trim().slice(0, 48);
  return clean || "Custom Font";
}

export type ValidatedUpload = {
  ext: string;
  rule: Rule;
  name: string;
  durationInSeconds: number | null;
  width: number | null;
  height: number | null;
};

export async function validateUpload(name: string, buf: Buffer): Promise<ValidatedUpload> {
  const ext = path.extname(name).slice(1).toLowerCase();
  const rule = UPLOAD_RULES[ext];
  if (!rule) throw new UploadError(`Unsupported file type ".${ext}". Allowed: ${Object.keys(UPLOAD_RULES).join(", ")}`, 415);
  if (buf.length === 0) throw new UploadError("File is empty");
  if (buf.length > rule.maxBytes) throw new UploadError(`File is larger than ${rule.maxBytes / MB} MB`, 413);
  if (!rule.sniff(buf)) throw new UploadError(`File contents don't look like a .${ext} file`, 415);

  let durationInSeconds: number | null = null;
  let width: number | null = null;
  let height: number | null = null;
  if (rule.kind === "video" || rule.kind === "audio") {
    const probe = await probeMedia(buf);
    if (!probe) throw new UploadError("Couldn't read this media file. Is it corrupted?", 422);
    if (rule.kind === "video" && probe.width == null) throw new UploadError("This MP4 has no video track", 422);
    if (rule.kind === "audio" && !probe.hasAudio) throw new UploadError("This file has no audio track", 422);
    ({ durationInSeconds, width, height } = probe);
  }
  return { ext, rule, name: cleanDisplayName(name), durationInSeconds, width, height };
}

async function probeMedia(buf: Buffer) {
  const input = new Input({
    source: new BufferSource(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer),
    formats: ALL_FORMATS,
  });
  try {
    const durationInSeconds = await input.computeDuration();
    const video = await input.getPrimaryVideoTrack();
    const audio = await input.getPrimaryAudioTrack();
    return {
      durationInSeconds: Number.isFinite(durationInSeconds) ? durationInSeconds : null,
      width: video ? video.displayWidth : null,
      height: video ? video.displayHeight : null,
      hasAudio: !!audio,
    };
  } catch {
    return null;
  } finally {
    input.dispose?.();
  }
}

/** Validate, write to the project's asset folder under a generated name, and record it. */
export async function storeUpload(projectId: string, originalName: string, buf: Buffer): Promise<AssetRecord> {
  const v = await validateUpload(originalName, buf);
  const id = newId("ast");
  const fileName = `${id}.${v.ext}`;
  fs.mkdirSync(assetsDir(projectId), { recursive: true });
  const target = assetPath(projectId, fileName);
  await fs.promises.writeFile(target, buf, { flag: "wx" });
  try {
    return insertAsset({
      id,
      projectId,
      kind: v.rule.kind,
      name: v.name,
      fileName,
      mime: v.rule.mime,
      size: buf.length,
      family: v.rule.kind === "font" ? fontFamilyFromName(v.name) : null,
      durationInSeconds: v.durationInSeconds,
      width: v.width,
      height: v.height,
    });
  } catch (err) {
    fs.rmSync(target, { force: true });
    throw err;
  }
}

export function removeAssetFile(asset: AssetRecord) {
  fs.rmSync(assetPath(asset.projectId, asset.fileName), { force: true });
}

export function mimeForFile(fileName: string): string {
  return UPLOAD_RULES[path.extname(fileName).slice(1).toLowerCase()]?.mime ?? "application/octet-stream";
}
