/**
 * Render the example project to MP4 without the web app or the queue:
 *   npm run export:example                 → landscape, standard quality
 *   npm run export:example -- vertical high
 * Output goes to out/.
 */
import fs from "node:fs";
import path from "node:path";
import { EXAMPLE_NAME } from "../src/lib/example";
import { buildCompositionProps } from "../src/lib/props";
import { createBundle, renderToFile, startAssetServer } from "../src/lib/server/render";
import { getProject, listAssets, listProjects } from "../src/lib/server/repo";
import { createExampleProject } from "../src/lib/server/seed";
import type { FormatId } from "../src/lib/schema";
import type { RenderQuality } from "../src/lib/types";

const format = (process.argv[2] ?? "landscape") as FormatId;
const quality = (process.argv[3] ?? "standard") as RenderQuality;

const existing = listProjects().find((p) => p.name === EXAMPLE_NAME);
const project = existing ? getProject(existing.id)! : await createExampleProject();

console.log(`Bundling compositions…`);
const serveUrl = await createBundle();
const server = await startAssetServer();
const props = buildCompositionProps(project.doc, listAssets(project.id), (a) => `${server.url}/${a.projectId}/${a.fileName}`, format);

const outDir = path.join(process.cwd(), "out");
fs.mkdirSync(outDir, { recursive: true });
const outputPath = path.join(outDir, `neon-launch-${format}.mp4`);
const started = Date.now();
let lastPct = -1;
await renderToFile({
  serveUrl,
  props,
  quality,
  outputPath,
  onProgress: (p) => {
    const pct = Math.floor(p * 10) * 10;
    if (pct !== lastPct) console.log(`  ${pct}%`), (lastPct = pct);
  },
});
await server.close();
console.log(`Wrote ${outputPath} in ${((Date.now() - started) / 1000).toFixed(1)}s`);
