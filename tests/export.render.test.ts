import fs from "node:fs";
import path from "node:path";
import { ALL_FORMATS, FilePathSource, Input } from "mediabunny";
import { afterAll, describe, expect, it } from "vitest";
import { buildCompositionProps } from "@/lib/props";
import { createBundle, renderToFile, startAssetServer } from "@/lib/server/render";
import { listAssets } from "@/lib/server/repo";
import { createExampleProject } from "@/lib/server/seed";
import { renderPath } from "@/lib/server/paths";
import { useTempDataDir } from "./helpers";

const tmp = useTempDataDir();
afterAll(tmp.cleanup);

/**
 * End to end: seed the example project through the upload pipeline, bundle
 * the compositions and render a real MP4 with the same code the worker uses.
 */
describe("export", () => {
  it("renders the example project to a playable MP4 in both formats", async () => {
    const project = await createExampleProject();
    // Trim to the first two scenes to keep the test quick.
    const doc = { ...project.doc, scenes: project.doc.scenes.slice(0, 2) };
    const serveUrl = await createBundle();
    const server = await startAssetServer();
    try {
      for (const [format, w, h] of [["landscape", 960, 540], ["vertical", 540, 960]] as const) {
        const props = buildCompositionProps(doc, listAssets(project.id), (a) => `${server.url}/${a.projectId}/${a.fileName}`, format);
        const out = renderPath(`test-${format}.mp4`);
        await renderToFile({ serveUrl, props, quality: "draft", outputPath: out });
        expect(fs.statSync(out).size).toBeGreaterThan(10_000);

        const input = new Input({ source: new FilePathSource(out), formats: ALL_FORMATS });
        const video = await input.getPrimaryVideoTrack();
        expect(video?.displayWidth).toBe(w);
        expect(video?.displayHeight).toBe(h);
        expect(await input.getPrimaryAudioTrack()).not.toBeNull();
        expect(await input.computeDuration()).toBeCloseTo((120 + 105 - 15) / 30, 0);
        input.dispose?.();
      }
    } finally {
      await server.close();
    }
    expect(fs.existsSync(path.join(tmp.dir, "renders"))).toBe(true);
  });
});
