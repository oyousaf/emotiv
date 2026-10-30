import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

/**
 * Remotion installs its own ffmpeg build with the renderer, so imports work
 * without a system ffmpeg. Falls back to `ffmpeg` on PATH.
 */
export function findFfmpeg(): { bin: string; cwd?: string } {
  const exe = process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg";
  const base = `compositor-${process.platform}-${process.arch}`;
  for (const name of [`${base}-msvc`, base, `${base}-gnu`, `${base}-musl`]) {
    const dir = path.join(process.cwd(), "node_modules", "@remotion", name);
    const bin = path.join(dir, exe);
    // The binary loads shared libraries from its own folder.
    if (fs.existsSync(bin)) return { bin, cwd: dir };
  }
  return { bin: "ffmpeg" };
}

/** Paths passed in args must be absolute: the process runs in the binary's folder. */
export function runFfmpeg(args: string[], timeoutMs = 10 * 60_000): Promise<{ code: number; stderr: string }> {
  const { bin, cwd } = findFfmpeg();
  return new Promise((resolve, reject) => {
    const child = spawn(bin, ["-hide_banner", "-nostdin", ...args], { cwd, windowsHide: true });
    let stderr = "";
    child.stderr.on("data", (d) => {
      stderr += d;
      // Keep memory bounded on long runs; the tail has what we parse.
      if (stderr.length > 4_000_000) stderr = stderr.slice(-2_000_000);
    });
    const timer = setTimeout(() => child.kill(), timeoutMs);
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? 1, stderr });
    });
  });
}
