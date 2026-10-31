import fs from "node:fs";
import { captions as captionsSchema, projectDoc, scene as sceneSchema, type Captions, type FormatId, type ProjectDoc, type Scene } from "../schema";
import { newId } from "../templates";
import { getTotalDuration } from "../timeline";
import type {
  AssetRecord,
  CustomTemplate,
  ProjectRecord,
  ProjectSummary,
  RenderJob,
  RenderQuality,
  RenderStatus,
} from "../types";
import { getDb, transaction } from "./db";
import { assertSafeId, projectDir, renderPath } from "./paths";

type Row = Record<string, unknown>;
const now = () => Date.now();

// ---------------------------------------------------------------- projects

function toProject(row: Row): ProjectRecord {
  // Re-validate on the way out so older documents pick up schema defaults.
  const doc = projectDoc.parse(JSON.parse(row.doc as string));
  return {
    id: row.id as string,
    name: row.name as string,
    format: doc.format,
    sceneCount: doc.scenes.length,
    durationInFrames: getTotalDuration(doc),
    createdAt: row.created_at as number,
    updatedAt: row.updated_at as number,
    doc,
  };
}

export function listProjects(): ProjectSummary[] {
  const rows = getDb().prepare("SELECT * FROM projects ORDER BY updated_at DESC").all() as Row[];
  return rows.map((r) => {
    const { doc: _doc, ...summary } = toProject(r);
    return summary;
  });
}

export function getProject(id: string): ProjectRecord | null {
  assertSafeId(id);
  const row = getDb().prepare("SELECT * FROM projects WHERE id = ?").get(id) as Row | undefined;
  return row ? toProject(row) : null;
}

export function createProject(name: string, doc: ProjectDoc, id = newId("prj")): ProjectRecord {
  const valid = projectDoc.parse(doc);
  const t = now();
  getDb()
    .prepare("INSERT INTO projects (id, name, doc, created_at, updated_at) VALUES (?, ?, ?, ?, ?)")
    .run(id, cleanName(name), JSON.stringify(valid), t, t);
  fs.mkdirSync(projectDir(id), { recursive: true });
  return getProject(id)!;
}

export function updateProject(id: string, patch: { name?: string; doc?: ProjectDoc }): ProjectRecord | null {
  const current = getProject(id);
  if (!current) return null;
  const doc = patch.doc ? projectDoc.parse(patch.doc) : current.doc;
  const name = patch.name != null ? cleanName(patch.name) : current.name;
  getDb()
    .prepare("UPDATE projects SET name = ?, doc = ?, updated_at = ? WHERE id = ?")
    .run(name, JSON.stringify(doc), now(), id);
  return getProject(id);
}

/** Finished MP4s are kept in the renders folder; only the project and its assets go. */
export function deleteProject(id: string): boolean {
  assertSafeId(id);
  const result = getDb().prepare("DELETE FROM projects WHERE id = ?").run(id);
  if (result.changes === 0) return false;
  fs.rmSync(projectDir(id), { recursive: true, force: true });
  return true;
}

function cleanName(name: string): string {
  const n = name.replace(/[\u0000-\u001f]/g, "").trim().slice(0, 100);
  return n || "Untitled project";
}

// ---------------------------------------------------------------- captions

export function getCaptions(projectId: string): Captions {
  assertSafeId(projectId);
  const row = getDb().prepare("SELECT data FROM captions WHERE project_id = ?").get(projectId) as Row | undefined;
  return captionsSchema.parse(row ? JSON.parse(row.data as string) : {});
}

/** Merges the given fields into the project's captions. Null if there's no such project. */
export function updateCaptions(projectId: string, patch: Partial<Captions>): Captions | null {
  if (!getProject(projectId)) return null;
  const next = captionsSchema.parse({ ...getCaptions(projectId), ...patch });
  getDb()
    .prepare(
      `INSERT INTO captions (project_id, data, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(project_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
    )
    .run(projectId, JSON.stringify(next), now());
  return next;
}

// ------------------------------------------------------------------ assets

function toAsset(row: Row): AssetRecord {
  return {
    id: row.id as string,
    projectId: row.project_id as string,
    kind: row.kind as AssetRecord["kind"],
    name: row.name as string,
    fileName: row.file_name as string,
    mime: row.mime as string,
    size: row.size as number,
    family: (row.family as string | null) ?? null,
    durationInSeconds: (row.duration as number | null) ?? null,
    width: (row.width as number | null) ?? null,
    height: (row.height as number | null) ?? null,
    createdAt: row.created_at as number,
  };
}

export function listAssets(projectId: string): AssetRecord[] {
  assertSafeId(projectId);
  const rows = getDb()
    .prepare("SELECT * FROM assets WHERE project_id = ? ORDER BY created_at ASC")
    .all(projectId) as Row[];
  return rows.map(toAsset);
}

export function getAssetByFile(projectId: string, fileName: string): AssetRecord | null {
  const row = getDb()
    .prepare("SELECT * FROM assets WHERE project_id = ? AND file_name = ?")
    .get(projectId, fileName) as Row | undefined;
  return row ? toAsset(row) : null;
}

export function insertAsset(a: Omit<AssetRecord, "createdAt">): AssetRecord {
  getDb()
    .prepare(
      `INSERT INTO assets (id, project_id, kind, name, file_name, mime, size, family, duration, width, height, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(a.id, a.projectId, a.kind, a.name, a.fileName, a.mime, a.size, a.family, a.durationInSeconds, a.width, a.height, now());
  return listAssets(a.projectId).find((x) => x.id === a.id)!;
}

export function deleteAsset(projectId: string, assetId: string): AssetRecord | null {
  assertSafeId(projectId);
  assertSafeId(assetId);
  const row = getDb()
    .prepare("SELECT * FROM assets WHERE project_id = ? AND id = ?")
    .get(projectId, assetId) as Row | undefined;
  if (!row) return null;
  getDb().prepare("DELETE FROM assets WHERE id = ?").run(assetId);
  return toAsset(row);
}

// ----------------------------------------------------------------- renders

export type RenderSnapshot = { doc: ProjectDoc; projectName: string };

function toRender(row: Row): RenderJob {
  return {
    id: row.id as string,
    projectId: row.project_id as string,
    projectName: (row.project_name as string) ?? "",
    status: row.status as RenderStatus,
    format: row.format as FormatId,
    quality: row.quality as RenderQuality,
    progress: row.progress as number,
    outputFile: (row.output_file as string | null) ?? null,
    error: (row.error as string | null) ?? null,
    createdAt: row.created_at as number,
    startedAt: (row.started_at as number | null) ?? null,
    finishedAt: (row.finished_at as number | null) ?? null,
  };
}

const RENDER_SELECT = `SELECT r.*, p.name AS project_name FROM renders r JOIN projects p ON p.id = r.project_id`;

/** Snapshot the document now, so later edits don't change a queued export. */
export function enqueueRender(projectId: string, format: FormatId, quality: RenderQuality): RenderJob {
  const project = getProject(projectId);
  if (!project) throw new Error("Project not found");
  const id = newId("rnd");
  const snapshot: RenderSnapshot = { doc: project.doc, projectName: project.name };
  getDb()
    .prepare(
      `INSERT INTO renders (id, project_id, status, format, quality, progress, snapshot, created_at)
       VALUES (?, ?, 'queued', ?, ?, 0, ?, ?)`,
    )
    .run(id, projectId, format, quality, JSON.stringify(snapshot), now());
  return getRender(id)!;
}

export function getRender(id: string): RenderJob | null {
  assertSafeId(id);
  const row = getDb().prepare(`${RENDER_SELECT} WHERE r.id = ?`).get(id) as Row | undefined;
  return row ? toRender(row) : null;
}

export function listRenders(projectId?: string, limit = 50): RenderJob[] {
  const db = getDb();
  const rows = projectId
    ? (db.prepare(`${RENDER_SELECT} WHERE r.project_id = ? ORDER BY r.created_at DESC LIMIT ?`).all(assertSafeId(projectId), limit) as Row[])
    : (db.prepare(`${RENDER_SELECT} ORDER BY r.created_at DESC LIMIT ?`).all(limit) as Row[]);
  return rows.map(toRender);
}

/** Atomically move the oldest queued job to "rendering" and return it. */
export function claimNextRender(): (RenderJob & { snapshot: RenderSnapshot }) | null {
  const db = getDb();
  return transaction(db, () => {
    const row = db
      .prepare("SELECT id, snapshot FROM renders WHERE status = 'queued' ORDER BY created_at ASC LIMIT 1")
      .get() as Row | undefined;
    if (!row) return null;
    db.prepare("UPDATE renders SET status = 'rendering', started_at = ?, progress = 0 WHERE id = ?").run(now(), row.id as string);
    return { ...getRender(row.id as string)!, snapshot: JSON.parse(row.snapshot as string) as RenderSnapshot };
  });
}

export function setRenderProgress(id: string, progress: number) {
  getDb()
    .prepare("UPDATE renders SET progress = ? WHERE id = ? AND status = 'rendering'")
    .run(Math.max(0, Math.min(1, progress)), id);
}

export function finishRender(id: string, result: { outputFile: string } | { error: string }) {
  const db = getDb();
  if ("outputFile" in result) {
    db.prepare(
      "UPDATE renders SET status = 'done', progress = 1, output_file = ?, finished_at = ? WHERE id = ?",
    ).run(result.outputFile, now(), id);
  } else {
    // Don't overwrite a cancellation with the abort error it caused.
    db.prepare(
      "UPDATE renders SET status = CASE WHEN status = 'cancelled' THEN 'cancelled' ELSE 'failed' END, error = ?, finished_at = ? WHERE id = ?",
    ).run(result.error.slice(0, 4000), now(), id);
  }
}

export function cancelRender(id: string): RenderJob | null {
  getDb()
    .prepare("UPDATE renders SET status = 'cancelled', finished_at = ? WHERE id = ? AND status IN ('queued', 'rendering')")
    .run(now(), id);
  return getRender(id);
}

export function getRenderStatus(id: string): RenderStatus | null {
  const row = getDb().prepare("SELECT status FROM renders WHERE id = ?").get(id) as Row | undefined;
  return (row?.status as RenderStatus) ?? null;
}

/** Jobs left "rendering" by a crashed worker go back to the queue. */
export function requeueStaleRenders(): number {
  return Number(
    getDb().prepare("UPDATE renders SET status = 'queued', progress = 0, started_at = NULL WHERE status = 'rendering'").run().changes,
  );
}

/**
 * Removes a job from the list. The MP4 stays in the renders folder (people post
 * straight from it) unless deleteFile is set.
 */
export function deleteRender(id: string, { deleteFile = false } = {}): boolean {
  const job = getRender(id);
  if (!job || job.status === "rendering") return false;
  getDb().prepare("DELETE FROM renders WHERE id = ?").run(id);
  if (deleteFile && job.outputFile) fs.rmSync(renderPath(job.outputFile), { force: true });
  return true;
}

// ---------------------------------------------------------- custom templates

export function listCustomTemplates(): (CustomTemplate & { scene: Scene })[] {
  const rows = getDb().prepare("SELECT * FROM templates ORDER BY created_at DESC").all() as Row[];
  return rows.map((r) => ({
    id: r.id as string,
    name: r.name as string,
    category: "custom",
    description: r.description as string,
    createdAt: r.created_at as number,
    scene: sceneSchema.parse(JSON.parse(r.scene as string)),
  }));
}

export function saveCustomTemplate(name: string, scene: Scene, description = ""): CustomTemplate {
  const id = newId("tpl");
  const valid = sceneSchema.parse(scene);
  getDb()
    .prepare("INSERT INTO templates (id, name, description, scene, created_at) VALUES (?, ?, ?, ?, ?)")
    .run(id, cleanName(name), description.slice(0, 200), JSON.stringify(valid), now());
  return listCustomTemplates().find((t) => t.id === id)!;
}

export function deleteCustomTemplate(id: string): boolean {
  assertSafeId(id);
  return getDb().prepare("DELETE FROM templates WHERE id = ?").run(id).changes > 0;
}
