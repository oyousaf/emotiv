import fs from "node:fs";
import { Readable } from "node:stream";

export function parseRange(header: string | null, size: number): { start: number; end: number } | null | "invalid" {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m || (m[1] === "" && m[2] === "")) return "invalid";
  let start: number;
  let end: number;
  if (m[1] === "") {
    // Suffix range: the last N bytes.
    const n = Number(m[2]);
    start = Math.max(0, size - n);
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] === "" ? size - 1 : Math.min(Number(m[2]), size - 1);
  }
  if (start > end || start >= size) return "invalid";
  return { start, end };
}

/**
 * Stream a file as a web Response with HTTP Range support (needed for video
 * seeking in the preview and by the renderer). Callers must have resolved
 * `absPath` through the path helpers first.
 */
export async function fileResponse(
  absPath: string,
  opts: { mime: string; range?: string | null; headers?: Record<string, string> },
): Promise<Response> {
  let stat: fs.Stats;
  try {
    stat = await fs.promises.stat(absPath);
  } catch {
    return new Response("Not found", { status: 404 });
  }
  if (!stat.isFile()) return new Response("Not found", { status: 404 });

  const base: Record<string, string> = {
    "Content-Type": opts.mime,
    "Accept-Ranges": "bytes",
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "private, max-age=3600",
    ...opts.headers,
  };
  const range = parseRange(opts.range ?? null, stat.size);
  if (range === "invalid") {
    return new Response(null, { status: 416, headers: { ...base, "Content-Range": `bytes */${stat.size}` } });
  }
  const { start, end } = range ?? { start: 0, end: stat.size - 1 };
  const stream = Readable.toWeb(fs.createReadStream(absPath, { start, end })) as ReadableStream;
  return new Response(stream, {
    status: range ? 206 : 200,
    headers: {
      ...base,
      "Content-Length": String(end - start + 1),
      ...(range ? { "Content-Range": `bytes ${start}-${end}/${stat.size}` } : {}),
    },
  });
}
