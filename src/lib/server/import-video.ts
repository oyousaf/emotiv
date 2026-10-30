import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runFfmpeg } from "./ffmpeg";

/**
 * Turn cut times (seconds) into shot lengths in frames, merging shots shorter
 * than `minFrames` into their neighbour so a flash frame doesn't become a scene.
 * Cut detection itself runs in the browser (see components/import/detect-cuts.ts).
 */
export function cutsToShots(cuts: number[], durationSeconds: number, fps = 30, minFrames = 15): { start: number; duration: number }[] {
  const total = Math.max(1, Math.round(durationSeconds * fps));
  const frames = [...new Set(cuts.map((c) => Math.round(c * fps)))].filter((f) => f > 0 && f < total).sort((a, b) => a - b);
  const edges = [0, ...frames, total];
  const shots: { start: number; duration: number }[] = [];
  for (let i = 0; i < edges.length - 1; i++) {
    const start = edges[i];
    const duration = edges[i + 1] - start;
    const last = shots[shots.length - 1];
    if (duration < minFrames && last) last.duration += duration;
    else shots.push({ start, duration });
  }
  // A short first shot can't merge backwards; fold it forwards instead.
  if (shots.length > 1 && shots[0].duration < minFrames) {
    shots[1] = { start: 0, duration: shots[0].duration + shots[1].duration };
    shots.shift();
  }
  return shots;
}

/** Extract the soundtrack to AAC (.m4a). Returns null if there's no audio. */
export async function extractAudio(mediaPath: string): Promise<Buffer | null> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "emotiv-audio-"));
  const out = path.join(dir, "audio.m4a");
  try {
    const { code } = await runFfmpeg(["-y", "-i", path.resolve(mediaPath), "-vn", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", "-f", "mp4", out]);
    if (code !== 0 || !fs.existsSync(out) || fs.statSync(out).size < 1024) return null;
    return fs.readFileSync(out);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
