import { openBrowser, renderStill, selectComposition } from "@remotion/renderer";
import { buildCompositionProps } from "../props";
import type { FormatId } from "../schema";
import { COMPOSITION_ID, createBundle, sourcesVersion, startAssetServer } from "./render";
import { getProject, listAssets } from "./repo";

/**
 * Single-frame previews for the AI assistant, so it can look at its own
 * edits. Keeps one bundle, one asset server and one browser warm.
 */
type Warm = {
  version: number;
  serveUrl: string;
  assetUrl: string;
  browser: Awaited<ReturnType<typeof openBrowser>>;
};
let warm: Promise<Warm> | null = null;

async function getWarm(): Promise<Warm> {
  const version = sourcesVersion();
  if (warm) {
    const w = await warm;
    if (w.version === version) return w;
    warm = null;
  }
  warm = (async () => {
    const [serveUrl, server, browser] = await Promise.all([createBundle(), startAssetServer(), openBrowser("chrome")]);
    return { version, serveUrl, assetUrl: server.url, browser };
  })();
  return warm;
}

export async function renderPreviewFrame(projectId: string, frame: number, format?: FormatId): Promise<Buffer> {
  const project = getProject(projectId);
  if (!project) throw new Error("Project not found");
  const w = await getWarm();
  const props = buildCompositionProps(project.doc, listAssets(projectId), (a) => `${w.assetUrl}/${a.projectId}/${a.fileName}`, format);
  const inputProps = props as unknown as Record<string, unknown>;
  const composition = await selectComposition({ serveUrl: w.serveUrl, id: COMPOSITION_ID, inputProps, puppeteerInstance: w.browser });
  const { buffer } = await renderStill({
    serveUrl: w.serveUrl,
    composition,
    inputProps,
    frame: Math.max(0, Math.min(composition.durationInFrames - 1, Math.round(frame))),
    imageFormat: "jpeg",
    jpegQuality: 80,
    scale: 0.5,
    puppeteerInstance: w.browser,
  });
  if (!buffer) throw new Error("Still render returned no image");
  return buffer;
}
