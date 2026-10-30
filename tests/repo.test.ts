import fs from "node:fs";
import { afterAll, describe, expect, it } from "vitest";
import { projectDir, renderPath } from "@/lib/server/paths";
import {
  cancelRender,
  claimNextRender,
  createProject,
  deleteProject,
  enqueueRender,
  finishRender,
  getProject,
  getRender,
  listCustomTemplates,
  listProjects,
  requeueStaleRenders,
  saveCustomTemplate,
  setRenderProgress,
  updateProject,
} from "@/lib/server/repo";
import { blankDoc } from "@/lib/templates";
import { useTempDataDir } from "./helpers";

const tmp = useTempDataDir();
afterAll(tmp.cleanup);

describe("projects", () => {
  it("creates, updates and lists projects", () => {
    const p = createProject("  My\u0000 clip  ", blankDoc("vertical"));
    expect(p.name).toBe("My clip");
    expect(p.format).toBe("vertical");
    expect(fs.existsSync(projectDir(p.id))).toBe(true);

    const doc = { ...p.doc, scenes: [...p.doc.scenes, { ...p.doc.scenes[0], id: "sc_two" }] };
    const updated = updateProject(p.id, { name: "Renamed", doc })!;
    expect(updated.sceneCount).toBe(2);
    expect(listProjects().find((x) => x.id === p.id)?.name).toBe("Renamed");
  });

  it("refuses invalid documents", () => {
    const p = createProject("Bad", blankDoc());
    expect(() => updateProject(p.id, { doc: { ...p.doc, scenes: [] } })).toThrow();
    expect(getProject(p.id)!.sceneCount).toBe(1);
  });
});

describe("render queue", () => {
  it("claims jobs oldest-first, exactly once", () => {
    const p = createProject("Queue", blankDoc());
    const a = enqueueRender(p.id, "landscape", "draft");
    const b = enqueueRender(p.id, "vertical", "standard");
    const first = claimNextRender()!;
    expect(first.id).toBe(a.id);
    expect(first.status).toBe("rendering");
    expect(first.snapshot.doc.scenes).toHaveLength(1);
    expect(claimNextRender()!.id).toBe(b.id);
    expect(claimNextRender()).toBeNull();
  });

  it("snapshots the document at enqueue time", () => {
    const p = createProject("Snapshot", blankDoc());
    const job = enqueueRender(p.id, "landscape", "draft");
    updateProject(p.id, { doc: { ...p.doc, scenes: [{ ...p.doc.scenes[0], name: "Changed later" }] } });
    const claimed = claimNextRender()!;
    expect(claimed.id).toBe(job.id);
    expect(claimed.snapshot.doc.scenes[0].name).not.toBe("Changed later");
  });

  it("tracks progress, completion, failure and cancellation", () => {
    const p = createProject("States", blankDoc());
    const job = enqueueRender(p.id, "landscape", "draft");
    claimNextRender();
    setRenderProgress(job.id, 0.42);
    expect(getRender(job.id)!.progress).toBeCloseTo(0.42);
    finishRender(job.id, { outputFile: `${job.id}.mp4` });
    expect(getRender(job.id)).toMatchObject({ status: "done", progress: 1 });

    const failing = enqueueRender(p.id, "landscape", "draft");
    claimNextRender();
    finishRender(failing.id, { error: "boom" });
    expect(getRender(failing.id)).toMatchObject({ status: "failed", error: "boom" });

    const cancelled = enqueueRender(p.id, "landscape", "draft");
    claimNextRender();
    cancelRender(cancelled.id);
    finishRender(cancelled.id, { error: "aborted" });
    expect(getRender(cancelled.id)!.status).toBe("cancelled");
  });

  it("re-queues renders left behind by a crashed worker", () => {
    const p = createProject("Crash", blankDoc());
    const job = enqueueRender(p.id, "landscape", "draft");
    claimNextRender();
    expect(requeueStaleRenders()).toBeGreaterThanOrEqual(1);
    expect(getRender(job.id)!.status).toBe("queued");
    claimNextRender();
    finishRender(job.id, { error: "cleanup" });
  });
});

describe("deleting a project", () => {
  it("removes its folder, renders and output files", () => {
    const p = createProject("Doomed", blankDoc());
    const job = enqueueRender(p.id, "landscape", "draft");
    claimNextRender();
    fs.writeFileSync(renderPath(`${job.id}.mp4`), "x");
    finishRender(job.id, { outputFile: `${job.id}.mp4` });
    expect(deleteProject(p.id)).toBe(true);
    expect(fs.existsSync(projectDir(p.id))).toBe(false);
    expect(fs.existsSync(renderPath(`${job.id}.mp4`))).toBe(false);
    expect(getRender(job.id)).toBeNull();
  });
});

describe("custom templates", () => {
  it("saves a scene as a reusable template", () => {
    const scene = blankDoc().scenes[0];
    const t = saveCustomTemplate("Neon title", scene);
    const listed = listCustomTemplates().find((x) => x.id === t.id)!;
    expect(listed.name).toBe("Neon title");
    expect(listed.scene.elements).toHaveLength(scene.elements.length);
  });
});
