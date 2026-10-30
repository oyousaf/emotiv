import path from "node:path";
import { extractLottieComp, listLottieComps, type CompInfo } from "../importers/comps";
import { GRAPHICS_PLACEHOLDER, importLottie, SOURCE_PLACEHOLDER, type LottieImportReport } from "../importers/lottie";
import { projectDoc, type FormatId, type ProjectDoc, type Scene } from "../schema";
import { blankDoc, newId, text } from "../templates";
import type { ProjectRecord } from "../types";
import { cutsToShots, extractAudio } from "./import-video";
import { assetPath } from "./paths";
import { createProject, deleteProject, listAssets, updateProject } from "./repo";
import { storeUpload, UploadError } from "./uploads";

export type ImportFile = { name: string; buf: Buffer };

/** A composition picked from an .aep/.aepx (parsed in the browser). */
export type AepCompMeta = Pick<CompInfo, "name" | "width" | "height" | "fps" | "durationSeconds" | "layers" | "texts" | "backgroundColor"> & {
  file: string;
};

export type ImportOptions = {
  name?: string;
  format?: FormatId;
  /** hybrid: editable text over exact graphics. exact: play the Lottie untouched. */
  mode?: "hybrid" | "exact";
  /** Which composition of the Lottie to import ("root" = main comp). */
  compId?: string;
  /** Metadata of the comp chosen from an After Effects project file. */
  aep?: AepCompMeta;
  /** Cut times in seconds, detected in the browser. */
  cuts?: number[];
  /** Use the original video as each shot's background instead of a plain colour. */
  keepFootage?: boolean;
};

export type ImportReport = {
  shots: number | null;
  audio: boolean;
  reference: boolean;
  lottie: LottieImportReport | null;
  aep: { comp: string; layers: number; texts: number } | null;
  assets: number;
  notes: string[];
};

const formatFor = (w: number | null | undefined, h: number | null | undefined): FormatId => ((w ?? 16) >= (h ?? 9) ? "landscape" : "vertical");

/**
 * A starting point from an AE comp's metadata alone: right size, length,
 * background and the comp's text, ready for the AI tab or manual rebuilding.
 */
function skeletonFromAep(meta: AepCompMeta, format: FormatId): ProjectDoc {
  const duration = Math.max(15, Math.min(18000, Math.round((meta.durationSeconds ?? 5) * 30)));
  const textLayers = meta.layers.filter((l) => l.type === "text");
  const elements = meta.texts.slice(0, 6).map((t, i, all) =>
    text({
      name: textLayers[i]?.name || `Text ${i + 1}`,
      text: t.slice(0, 2000),
      y: Math.round(((i + 1) / (all.length + 1)) * 1000) / 10,
      fontSize: i === 0 ? (format === "vertical" ? 110 : 150) : format === "vertical" ? 54 : 64,
      fontWeight: i === 0 ? 800 : 500,
      start: i * 8,
      animIn: { preset: i === 0 ? "maskUp" : "slideUp", split: i === 0 ? "words" : "none", duration: 16, distance: 40 },
    }),
  );
  const bg = /^#[0-9a-f]{6}$/i.test(meta.backgroundColor ?? "") ? meta.backgroundColor! : "#111118";
  return projectDoc.parse({
    fps: 30,
    format,
    scenes: [{ id: newId("sc"), name: meta.name.slice(0, 80) || "Comp", duration, background: { type: "color", color: bg }, transition: { type: "none", duration: 15 }, elements }],
  });
}

/**
 * Build a new project from an old video, an After Effects comp (Bodymovin
 * export or .aep metadata), or a mix, plus fonts and footage. Every file goes
 * through the normal upload validation. On failure the project is removed.
 */
export async function importProject(
  files: { video?: ImportFile; lottie?: ImportFile; extras?: ImportFile[] },
  opts: ImportOptions = {},
): Promise<{ project: ProjectRecord; report: ImportReport }> {
  if (!files.video && !files.lottie && !opts.aep) {
    throw new UploadError("Add an old video, an After Effects comp, or both.");
  }
  if (files.video && !/\.(mp4|m4v)$/i.test(files.video.name)) throw new UploadError("The old video must be an MP4.");
  if (files.lottie && !/\.json$/i.test(files.lottie.name)) throw new UploadError("The After Effects export must be a Bodymovin/Lottie .json file.");

  const baseName = opts.aep?.name || (files.lottie ?? files.video)?.name.replace(/\.[^.]+$/, "") || "Imported project";
  const project = createProject(opts.name?.trim() || baseName, blankDoc(opts.format ?? "landscape"));
  const report: ImportReport = { shots: null, audio: false, reference: false, lottie: null, aep: null, assets: 0, notes: [] };
  try {
    for (const f of files.extras ?? []) {
      await storeUpload(project.id, f.name, f.buf);
      report.assets++;
    }
    const video = files.video ? await storeUpload(project.id, files.video.name, files.video.buf) : null;
    if (video) report.assets++;

    let doc: ProjectDoc;
    let source: ProjectDoc["source"] = null;
    if (files.lottie) {
      let root;
      try {
        root = JSON.parse(files.lottie.buf.toString("utf8"));
      } catch {
        throw new UploadError("This JSON isn't a Lottie/Bodymovin animation", 422);
      }
      // Importing one precomp: store just that comp as its own animation.
      const compId = opts.compId ?? "root";
      const info = Array.isArray(root?.layers) ? listLottieComps(root).find((c) => c.id === compId) : undefined;
      let lottieFile = files.lottie;
      if (compId !== "root") {
        if (!info) throw new UploadError(`No composition "${compId}" in this file.`);
        root = extractLottieComp(root, compId);
        lottieFile = { name: `${baseName} - ${info.name}.json`.replace(/[\\/]/g, "-"), buf: Buffer.from(JSON.stringify(root)) };
      }
      const lottie = await storeUpload(project.id, lottieFile.name, lottieFile.buf);
      report.assets++;
      const families = listAssets(project.id).filter((a) => a.kind === "font" && a.family).map((a) => a.family!);
      const result = importLottie(root, { mode: opts.mode ?? "hybrid", format: opts.format, availableFamilies: families });
      let json = JSON.stringify(result.doc).replaceAll(SOURCE_PLACEHOLDER, lottie.id);
      if (result.graphics) {
        const g = await storeUpload(project.id, `${baseName} graphics.json`, Buffer.from(JSON.stringify(result.graphics)));
        json = json.replaceAll(GRAPHICS_PLACEHOLDER, g.id);
        report.assets++;
      }
      doc = projectDoc.parse(JSON.parse(json));
      report.lottie = result.report;
      if (info) {
        source = {
          kind: "lottie",
          file: files.lottie.name.slice(0, 200),
          comp: info.name.slice(0, 200),
          width: info.width,
          height: info.height,
          fps: info.fps,
          durationSeconds: info.durationSeconds,
          layers: info.layers.slice(0, 500).map((l) => ({ name: l.name.slice(0, 200), type: l.type })),
          texts: info.texts.slice(0, 20),
        };
      }
    } else if (video) {
      // Video: one scene per detected shot, ready to rebuild over.
      const format = opts.format ?? formatFor(video.width, video.height);
      const shots = cutsToShots(opts.cuts ?? [], video.durationInSeconds ?? 5);
      const scenes: Scene[] = shots.map((s, i) => ({
        id: newId("sc"),
        name: `Shot ${i + 1}`,
        duration: s.duration,
        background: opts.keepFootage
          ? { type: "video", assetId: video.id, dim: 0, playbackRate: 1, trimBefore: s.start, loop: false }
          : { type: "color", color: "#111118" },
        transition: { type: "none", duration: 15 },
        elements: [],
      }));
      doc = projectDoc.parse({ fps: 30, format, scenes });
      report.shots = shots.length;
      source = { kind: "video", file: video.name, comp: null, width: video.width, height: video.height, fps: null, durationSeconds: video.durationInSeconds, layers: [], texts: [] };
    } else {
      doc = skeletonFromAep(opts.aep!, opts.format ?? formatFor(opts.aep!.width, opts.aep!.height));
    }

    // An AE project comp's metadata always wins as the recorded source.
    if (opts.aep) {
      const a = opts.aep;
      source = {
        kind: "aep",
        file: a.file.slice(0, 200),
        comp: a.name.slice(0, 200),
        width: a.width,
        height: a.height,
        fps: a.fps,
        durationSeconds: a.durationSeconds,
        layers: a.layers.slice(0, 500).map((l) => ({ name: l.name.slice(0, 200), type: l.type.slice(0, 20) })),
        texts: a.texts.slice(0, 20).map((t) => t.slice(0, 500)),
      };
      report.aep = { comp: a.name, layers: a.layers.length, texts: a.texts.length };
      if (!files.lottie) {
        report.notes.push(
          "Built from the comp's metadata. For its exact animation, export this comp with Bodymovin and import the JSON, or ask the AI tab to rebuild it from the layer list.",
        );
      }
    }
    doc.source = source;

    if (video) {
      doc.reference = { assetId: video.id, opacity: 0.5 };
      report.reference = true;
      const audio = await extractAudio(assetPath(project.id, video.fileName));
      if (audio) {
        const a = await storeUpload(project.id, `${path.parse(video.name).name} audio.m4a`, audio);
        doc.soundtrack = { assetId: a.id, volume: 1, fadeOut: 0 };
        report.audio = true;
        report.assets++;
      } else {
        report.notes.push("The video has no audio track, so no soundtrack was added.");
      }
    }

    return { project: updateProject(project.id, { doc })!, report };
  } catch (err) {
    deleteProject(project.id);
    throw err;
  }
}
