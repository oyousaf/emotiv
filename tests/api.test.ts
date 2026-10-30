import { afterAll, describe, expect, it } from "vitest";
import * as projects from "@/app/api/projects/route";
import * as project from "@/app/api/projects/[id]/route";
import * as assets from "@/app/api/projects/[id]/assets/route";
import * as asset from "@/app/api/projects/[id]/assets/[assetId]/route";
import * as files from "@/app/api/projects/[id]/files/[file]/route";
import * as renders from "@/app/api/projects/[id]/renders/route";
import * as download from "@/app/api/renders/[id]/download/route";
import type { ProjectRecord, AssetRecord, RenderJob } from "@/lib/types";
import { exampleFile, useTempDataDir } from "./helpers";

const tmp = useTempDataDir();
afterAll(tmp.cleanup);

const ctx = <P extends Record<string, string>>(p: P) => ({ params: Promise.resolve(p) });
const post = (body: unknown) =>
  new Request("http://x", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

function upload(name: string, buf: Buffer) {
  const form = new FormData();
  form.append("file", new File([new Uint8Array(buf)], name));
  return new Request("http://x", { method: "POST", body: form });
}

describe("HTTP API", () => {
  let p: ProjectRecord;
  let image: AssetRecord;

  it("creates a project from a template", async () => {
    const res = await projects.POST(post({ name: "API test", format: "vertical", templateId: "stat-counter" }));
    expect(res.status).toBe(201);
    p = await res.json();
    expect(p.format).toBe("vertical");
    expect(p.doc.scenes[0].name).toBe("Stat Counter");
  });

  it("validates project updates", async () => {
    const bad = new Request("http://x", { method: "PUT", body: JSON.stringify({ doc: { scenes: [] } }) });
    expect((await project.PUT(bad, ctx({ id: p.id }))).status).toBe(400);
    const malformed = new Request("http://x", { method: "PUT", body: "{nope" });
    expect((await project.PUT(malformed, ctx({ id: p.id }))).status).toBe(400);
    expect((await project.GET(new Request("http://x"), ctx({ id: "../etc" }))).status).toBe(400);
  });

  it("uploads, validates and serves assets with range support", async () => {
    const res = await assets.POST(upload("mark.png", exampleFile("orbit-mark.png")), ctx({ id: p.id }));
    expect(res.status).toBe(201);
    [image] = await res.json();

    const rejected = await assets.POST(upload("mark.mp4", exampleFile("orbit-mark.png")), ctx({ id: p.id }));
    expect(rejected.status).toBe(415);

    const full = await files.GET(new Request("http://x"), ctx({ id: p.id, file: image.fileName }));
    expect(full.status).toBe(200);
    expect(full.headers.get("content-type")).toBe("image/png");
    expect(full.headers.get("x-content-type-options")).toBe("nosniff");

    const ranged = await files.GET(new Request("http://x", { headers: { Range: "bytes=0-7" } }), ctx({ id: p.id, file: image.fileName }));
    expect(ranged.status).toBe(206);
    expect(Buffer.from(await ranged.arrayBuffer())).toEqual(exampleFile("orbit-mark.png").subarray(0, 8));

    const traversal = await files.GET(new Request("http://x"), ctx({ id: p.id, file: "../studio.db" }));
    expect(traversal.status).toBe(404);
  });

  it("refuses to delete an asset that is in use", async () => {
    const doc = structuredClone(p.doc);
    doc.scenes[0].background = { type: "image", assetId: image.id, dim: 0.3, kenBurns: true };
    const put = new Request("http://x", { method: "PUT", body: JSON.stringify({ doc }) });
    expect((await project.PUT(put, ctx({ id: p.id }))).status).toBe(200);
    const res = await asset.DELETE(new Request("http://x"), ctx({ id: p.id, assetId: image.id }));
    expect(res.status).toBe(409);
  });

  it("queues renders and refuses downloads until done", async () => {
    const res = await renders.POST(post({ quality: "draft" }), ctx({ id: p.id }));
    expect(res.status).toBe(201);
    const job: RenderJob = await res.json();
    expect(job).toMatchObject({ status: "queued", format: "vertical", quality: "draft" });
    expect((await download.GET(new Request("http://x"), ctx({ id: job.id }))).status).toBe(409);
  });
});
