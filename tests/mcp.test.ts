import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { TOOLS } from "../mcp/tools";
import { translate } from "@/lib/server/claude";
import { getProject, listAssets } from "@/lib/server/repo";
import { EXAMPLE_DIR, useTempDataDir } from "./helpers";

const tmp = useTempDataDir();
afterAll(tmp.cleanup);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const call = (name: string, args: any = {}) => {
  const t = TOOLS.find((x) => x.name === name)!;
  return Promise.resolve((t.handler as (a: unknown) => unknown)(args)) as Promise<{ text: string; isError?: boolean }>;
};

describe("MCP tools", () => {
  let id = "";

  it("creates and reads a project", async () => {
    const r = await call("create_project", { name: "MCP test", format: "landscape", templateId: "stat-counter" });
    id = /\((prj_[a-z0-9]+)\)/.exec(r.text)![1];
    const p = await call("get_project", { projectId: id });
    expect(p.text).toContain('"MCP test"');
    expect(p.text).toContain("Stat Counter");
  });

  it("edits elements by name and merges animation settings", async () => {
    const r = await call("update_element", {
      projectId: id,
      sceneId: "Stat Counter",
      elementId: "Number",
      patch: { color: "#ffd700", animIn: { preset: "blur" }, counter: { to: 50000, suffix: "K" } },
    });
    expect(r.isError).toBeFalsy();
    const el = getProject(id)!.doc.scenes[0].elements.find((e) => e.name === "Number")!;
    expect(el).toMatchObject({ color: "#ffd700", animIn: { preset: "blur", duration: 20 }, counter: { to: 50000, suffix: "K", from: 0 } });
  });

  it("rejects invalid edits with a reason and leaves the project alone", async () => {
    const before = JSON.stringify(getProject(id)!.doc);
    const r = await call("update_element", { projectId: id, sceneId: "Stat Counter", elementId: "Number", patch: { fontSize: -5 } });
    expect(r.isError).toBe(true);
    expect(r.text).toMatch(/fontSize/);
    expect(JSON.stringify(getProject(id)!.doc)).toBe(before);
  });

  it("adds scenes and layers, removes them, and won't delete the last scene", async () => {
    await call("add_scene", { projectId: id, templateId: "lower-third" });
    const doc = getProject(id)!.doc;
    expect(doc.scenes.map((s) => s.name)).toEqual(["Stat Counter", "Lower Third"]);
    const add = await call("add_element", { projectId: id, sceneId: "Lower Third", element: { type: "text", text: "Hello", fontSize: 64 } });
    expect(add.isError).toBeFalsy();
    expect(getProject(id)!.doc.scenes[1].elements.at(-1)).toMatchObject({ type: "text", text: "Hello", animIn: { preset: "fade" } });
    await call("remove", { projectId: id, sceneId: "Lower Third" });
    expect((await call("remove", { projectId: id, sceneId: "Stat Counter" })).isError).toBe(true);
  });

  it("imports local files through the upload checks", async () => {
    expect((await call("import_asset", { projectId: id, filePath: "relative.png" })).isError).toBe(true);
    const r = await call("import_asset", { projectId: id, filePath: path.join(EXAMPLE_DIR, "Anton-Regular.ttf") });
    expect(r.text).toMatch(/font family "Anton"/);
    expect(listAssets(id)).toHaveLength(1);
    const bad = await call("import_asset", { projectId: id, filePath: path.join(os.tmpdir(), "does-not-exist.png") });
    expect(bad.isError).toBe(true);
  });

  it("queues renders", async () => {
    const r = await call("render_video", { projectId: id, quality: "draft" });
    expect(r.text).toMatch(/Queued render rnd_/);
  });
});

describe("assistant stream", () => {
  it("translates Claude Code stream-json into UI events", () => {
    expect(translate({ type: "system", subtype: "init", session_id: "abc" })).toEqual([{ kind: "session", sessionId: "abc" }]);
    expect(
      translate({
        type: "assistant",
        message: { content: [{ type: "text", text: "Done." }, { type: "tool_use", name: "mcp__emotiv__update_element", input: { a: 1 } }] },
      }),
    ).toEqual([
      { kind: "text", text: "Done." },
      { kind: "tool", name: "update_element", input: { a: 1 } },
    ]);
    expect(translate({ type: "user", message: { content: [{ type: "tool_result", is_error: true }] } })).toEqual([{ kind: "tool_result", isError: true }]);
    expect(translate({ type: "result", is_error: false, result: "ok", total_cost_usd: 0.1, num_turns: 3 })).toEqual([
      { kind: "done", ok: true, result: "ok", costUsd: 0.1, turns: 3 },
    ]);
    expect(translate({ type: "stream_event" })).toEqual([]);
  });
});
