/**
 * Shot detection that runs in the browser: seek through the video, draw tiny
 * greyscale thumbnails to a canvas and look for big jumps between samples.
 * This only analyses the file; nothing is rendered.
 */

const W = 48;
const H = 27;

/** Mean absolute difference between two greyscale frames, 0–255. */
export function frameDiff(a: Uint8ClampedArray, b: Uint8ClampedArray): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - b[i]);
  return sum / a.length;
}

/**
 * Indices of samples that start a new shot. A cut needs an absolute jump and
 * must stand out from the local motion level, so fast-moving footage doesn't
 * register as a string of cuts.
 */
export function pickCuts(scores: number[], opts: { minScore?: number; ratio?: number; minGap?: number } = {}): number[] {
  const { minScore = 22, ratio = 2.5, minGap = 3 } = opts;
  const cuts: number[] = [];
  for (let i = 1; i < scores.length; i++) {
    const window = scores.slice(Math.max(1, i - 6), i).concat(scores.slice(i + 1, i + 7));
    const sorted = [...window].sort((x, y) => x - y);
    const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
    const isPeak = scores[i] >= (scores[i - 1] ?? 0) && scores[i] >= (scores[i + 1] ?? 0);
    if (scores[i] >= minScore && scores[i] >= median * ratio && isPeak) {
      if (cuts.length && i - cuts[cuts.length - 1] < minGap) continue;
      cuts.push(i);
    }
  }
  return cuts;
}

function seek(video: HTMLVideoElement, t: number) {
  return new Promise<void>((resolve) => {
    const done = () => {
      video.removeEventListener("seeked", done);
      resolve();
    };
    video.addEventListener("seeked", done);
    video.currentTime = t;
  });
}

export async function detectCuts(file: File, onProgress?: (p: number) => void, samplesPerSecond = 6): Promise<number[]> {
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.muted = true;
  video.preload = "auto";
  video.src = url;
  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadeddata = () => resolve();
      video.onerror = () => reject(new Error("This browser can't decode the video for shot detection."));
    });
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    const grab = async (t: number) => {
      await seek(video, t);
      ctx.drawImage(video, 0, 0, W, H);
      const rgba = ctx.getImageData(0, 0, W, H).data;
      const grey = new Uint8ClampedArray(W * H);
      for (let i = 0; i < grey.length; i++) grey[i] = rgba[i * 4] * 0.299 + rgba[i * 4 + 1] * 0.587 + rgba[i * 4 + 2] * 0.114;
      return grey;
    };

    const duration = video.duration;
    const step = 1 / samplesPerSecond;
    const times: number[] = [];
    for (let t = 0; t < duration - 0.05; t += step) times.push(t);
    const scores: number[] = [0];
    let prev = await grab(0);
    for (let i = 1; i < times.length; i++) {
      const cur = await grab(times[i]);
      scores.push(frameDiff(prev, cur));
      prev = cur;
      onProgress?.((i / times.length) * 0.85);
    }

    // Refine each cut to the exact frame between the two samples.
    const coarse = pickCuts(scores);
    const cuts: number[] = [];
    for (const [n, i] of coarse.entries()) {
      const from = times[i - 1];
      let best = { t: times[i], score: -1 };
      let last = await grab(from);
      for (let t = from + 1 / 30; t <= times[i] + 0.001; t += 1 / 30) {
        const cur = await grab(t);
        const s = frameDiff(last, cur);
        if (s > best.score) best = { t, score: s };
        last = cur;
      }
      cuts.push(Math.round(best.t * 30) / 30);
      onProgress?.(0.85 + ((n + 1) / coarse.length) * 0.15);
    }
    onProgress?.(1);
    return cuts;
  } finally {
    URL.revokeObjectURL(url);
    video.removeAttribute("src");
    video.load();
  }
}
