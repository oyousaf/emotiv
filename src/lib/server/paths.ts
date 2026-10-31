import path from "node:path";

/**
 * All filesystem access goes through here. Ids are validated before they
 * become path segments, and every joined path is checked to still be inside
 * its base directory, so nothing from a request can escape the data folder.
 */
export function getDataDir(): string {
  return path.resolve(process.env.STUDIO_DATA_DIR ?? path.join(process.cwd(), "data"));
}

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const FILE_RE = /^[A-Za-z0-9_-]{1,64}\.[a-z0-9]{2,5}$/;

export function isSafeId(id: unknown): id is string {
  return typeof id === "string" && ID_RE.test(id);
}

export function assertSafeId(id: unknown, what = "id"): string {
  if (!isSafeId(id)) throw new PathError(`Invalid ${what}`);
  return id;
}

export function isSafeFileName(name: unknown): name is string {
  return typeof name === "string" && FILE_RE.test(name);
}

export class PathError extends Error {}

export function safeJoin(base: string, ...segments: string[]): string {
  const root = path.resolve(base);
  const target = path.resolve(root, ...segments);
  const rel = path.relative(root, target);
  if (rel === "" || rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new PathError("Path escapes its directory");
  }
  return target;
}

export function projectDir(projectId: string): string {
  return safeJoin(getDataDir(), "projects", assertSafeId(projectId, "project id"));
}

export function assetsDir(projectId: string): string {
  return safeJoin(projectDir(projectId), "assets");
}

export function assetPath(projectId: string, fileName: string): string {
  if (!isSafeFileName(fileName)) throw new PathError("Invalid file name");
  return safeJoin(assetsDir(projectId), fileName);
}

export function rendersDir(): string {
  return path.join(getDataDir(), "renders");
}

/** "Al-Jathiyah 1–5 · English" → "al-jathiyah-1-5-english". */
export function slugify(name: string, fallback = "render"): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || fallback;
}

/** A readable, unique MP4 name, so the renders folder can be browsed directly. */
export function renderFileName(projectName: string, jobId: string): string {
  const slug = slugify(projectName).slice(0, 64 - jobId.length - 1).replace(/-$/, "");
  return `${slug}-${jobId}.mp4`;
}

export function renderPath(fileName: string): string {
  if (!isSafeFileName(fileName)) throw new PathError("Invalid file name");
  return safeJoin(rendersDir(), fileName);
}

export function dbPath(): string {
  return path.join(getDataDir(), "studio.db");
}
