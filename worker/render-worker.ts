/**
 * Background render worker. Runs as its own Node process next to the web app,
 * pulls jobs from the SQLite queue one at a time and renders them to MP4 with
 * @remotion/renderer. Start with `npm run worker` (or `npm run dev`).
 */
import { ensureBrowser } from "@remotion/renderer";
import { buildCompositionProps } from "../src/lib/props";
import { writeHeartbeat } from "../src/lib/server/heartbeat";
import { renderPath } from "../src/lib/server/paths";
import { createBundle, renderToFile, sourcesVersion, startAssetServer } from "../src/lib/server/render";
import {
  claimNextRender,
  finishRender,
  getRenderStatus,
  listAssets,
  requeueStaleRenders,
  setRenderProgress,
} from "../src/lib/server/repo";

const POLL_MS = 1000;
const log = (...args: unknown[]) => console.log(`[worker ${new Date().toLocaleTimeString()}]`, ...args);

let bundleUrl: string | null = null;
let bundleVersion = 0;
let stopping = false;
let currentJob: string | null = null;
let state = "starting";
const beat = () => writeHeartbeat(currentJob ? "rendering" : state);

async function getBundle(): Promise<string> {
  const version = sourcesVersion();
  if (!bundleUrl || version !== bundleVersion) {
    state = "bundling";
    log(bundleUrl ? "Composition sources changed, rebundling…" : "Bundling compositions…");
    let last = 0;
    bundleUrl = await createBundle((p) => {
      if (p - last >= 0.25) log(`  bundle ${Math.round(p * 100)}%`), (last = p);
    });
    bundleVersion = version;
    state = "idle";
    log("Bundle ready");
  }
  return bundleUrl;
}

async function processJob(assetBaseUrl: string): Promise<boolean> {
  const job = claimNextRender();
  if (!job) return false;
  currentJob = job.id;
  const started = Date.now();
  log(`Rendering ${job.id} · "${job.snapshot.projectName}" · ${job.format} · ${job.quality}`);
  try {
    const serveUrl = await getBundle();
    const props = buildCompositionProps(
      job.snapshot.doc,
      listAssets(job.projectId),
      (a) => `${assetBaseUrl}/${a.projectId}/${a.fileName}`,
      job.format,
    );
    const outputFile = `${job.id}.mp4`;
    let lastWrite = 0;
    await renderToFile({
      serveUrl,
      props,
      quality: job.quality,
      outputPath: renderPath(outputFile),
      onProgress: (p) => {
        if (Date.now() - lastWrite > 400) {
          setRenderProgress(job.id, p);
          lastWrite = Date.now();
        }
      },
      shouldCancel: () => stopping || getRenderStatus(job.id) === "cancelled",
    });
    finishRender(job.id, { outputFile });
    log(`Done ${job.id} in ${((Date.now() - started) / 1000).toFixed(1)}s`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (stopping) {
      log(`Interrupted ${job.id}; it will be re-queued on next start`);
    } else {
      finishRender(job.id, { error: message });
      log(`Failed ${job.id}: ${message}`);
    }
  } finally {
    currentJob = null;
  }
  return true;
}

async function main() {
  log("Starting render worker");
  beat();
  const heartbeat = setInterval(beat, 3000);
  await ensureBrowser({
    onBrowserDownload: () => {
      log("Downloading Chrome Headless Shell (first run only)…");
      return { version: null, onProgress: () => undefined };
    },
  });
  const requeued = requeueStaleRenders();
  if (requeued) log(`Re-queued ${requeued} interrupted render(s)`);
  const server = await startAssetServer();
  log(`Asset server on ${server.url}`);
  await getBundle();
  state = "idle";
  log("Waiting for jobs…");

  while (!stopping) {
    const worked = await processJob(server.url).catch((err) => {
      log("Worker error:", err);
      return false;
    });
    if (!worked) await new Promise((r) => setTimeout(r, POLL_MS));
  }
  clearInterval(heartbeat);
  writeHeartbeat("stopped");
  await server.close();
  process.exit(0);
}

function shutdown() {
  if (stopping) process.exit(1);
  stopping = true;
  log(currentJob ? "Stopping after cancelling the current render…" : "Stopping…");
  if (!currentJob) {
    writeHeartbeat("stopped");
    setTimeout(() => process.exit(0), 50);
  }
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
