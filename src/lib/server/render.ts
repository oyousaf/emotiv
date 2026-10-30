import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { Readable } from "node:stream";
import type { AddressInfo } from "node:net";
import { bundle } from "@remotion/bundler";
import { makeCancelSignal, renderMedia, selectComposition } from "@remotion/renderer";
import type { CompositionProps } from "../schema";
import type { RenderQuality } from "../types";
import { fileResponse } from "./files";
import { assetPath, isSafeFileName, isSafeId, PathError } from "./paths";
import { mimeForFile } from "./uploads";

/**
 * Server-side rendering. Only the worker process (and tests/scripts) import
 * this module; the Next.js app never renders video itself.
 */

export const COMPOSITION_ID = "Main";
// Resolved lazily: the MCP server changes directory to the app root after imports load.
const entry = () => path.join(process.cwd(), "src", "remotion", "index.ts");
const watched = () => [path.join(process.cwd(), "src", "remotion"), path.join(process.cwd(), "src", "lib")];

export async function createBundle(onProgress?: (p: number) => void): Promise<string> {
  return bundle({ entryPoint: entry(), onProgress: (p) => onProgress?.(p / 100) });
}

/** Newest mtime of the composition sources, to know when to rebundle in dev. */
export function sourcesVersion(): number {
  let latest = 0;
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(p);
      else latest = Math.max(latest, fs.statSync(p).mtimeMs);
    }
  };
  watched().filter((d) => fs.existsSync(d)).forEach(walk);
  return latest;
}

/**
 * Local-only HTTP server that exposes project assets to headless Chrome
 * during a render: GET /<projectId>/<fileName>. Bound to 127.0.0.1 and
 * restricted to the per-project asset folders.
 */
export async function startAssetServer(): Promise<{ url: string; close: () => Promise<void> }> {
  const server = http.createServer(async (req, res) => {
    try {
      const [, projectId, fileName, ...rest] = new URL(req.url ?? "/", "http://x").pathname.split("/");
      if (req.method !== "GET" && req.method !== "HEAD") throw new PathError("Method not allowed");
      if (rest.length || !isSafeId(projectId) || !isSafeFileName(fileName)) throw new PathError("Bad path");
      const response = await fileResponse(assetPath(projectId, fileName), {
        mime: mimeForFile(fileName),
        range: req.headers.range ?? null,
        headers: { "Access-Control-Allow-Origin": "*" },
      });
      res.writeHead(response.status, Object.fromEntries(response.headers));
      if (req.method === "HEAD" || !response.body) return void res.end();
      Readable.fromWeb(response.body as import("node:stream/web").ReadableStream).pipe(res);
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

export const QUALITY_SETTINGS: Record<RenderQuality, { crf: number; scale: number; x264Preset: "veryfast" | "medium" | "slow" }> = {
  draft: { crf: 28, scale: 0.5, x264Preset: "veryfast" },
  standard: { crf: 20, scale: 1, x264Preset: "medium" },
  high: { crf: 16, scale: 1, x264Preset: "slow" },
};

export async function renderToFile(opts: {
  serveUrl: string;
  props: CompositionProps;
  quality: RenderQuality;
  outputPath: string;
  onProgress?: (p: number) => void;
  shouldCancel?: () => boolean;
}): Promise<void> {
  const { serveUrl, props, quality, outputPath } = opts;
  const inputProps = props as unknown as Record<string, unknown>;
  const composition = await selectComposition({ serveUrl, id: COMPOSITION_ID, inputProps });
  const { cancelSignal, cancel } = makeCancelSignal();
  const poll = opts.shouldCancel ? setInterval(() => opts.shouldCancel!() && cancel(), 1000) : null;
  const tmp = `${outputPath}.part.mp4`;
  const q = QUALITY_SETTINGS[quality];
  try {
    await renderMedia({
      serveUrl,
      composition,
      inputProps,
      codec: "h264",
      audioCodec: "aac",
      pixelFormat: "yuv420p",
      crf: q.crf,
      scale: q.scale,
      x264Preset: q.x264Preset,
      outputLocation: tmp,
      overwrite: true,
      cancelSignal,
      onProgress: ({ progress }) => opts.onProgress?.(progress),
    });
    fs.renameSync(tmp, outputPath);
  } finally {
    if (poll) clearInterval(poll);
    fs.rmSync(tmp, { force: true });
  }
}
