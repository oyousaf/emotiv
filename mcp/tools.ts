import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { addScene, moveScene, removeElement, removeScene } from "../src/lib/doc-ops";
import { element, projectDoc, scene as sceneSchema, type ProjectDoc, type SceneElement } from "../src/lib/schema";
import { BUILTIN_TEMPLATES, cloneScene, getBuiltinTemplate, newId } from "../src/lib/templates";
import { getSceneTimings, getTotalDuration } from "../src/lib/timeline";
import {
  createProject,
  enqueueRender,
  getProject,
  getRender,
  listAssets,
  listCustomTemplates,
  listProjects,
  listRenders,
  updateCaptions,
  updateProject,
} from "../src/lib/server/repo";
import { storeUpload } from "../src/lib/server/uploads";

/**
 * emotiv's MCP tools. Each one works directly on the local database, so the
 * editor picks up the change on its next poll. Kept separate from the
 * transport so tests can call the handlers directly.
 */

export type ToolResult = { text: string; image?: { data: string; mimeType: string }; isError?: boolean };
type Tool<S extends z.ZodRawShape> = {
  name: string;
  description: string;
  input: S;
  handler: (args: z.infer<z.ZodObject<S>>) => Promise<ToolResult> | ToolResult;
};
const tool = <S extends z.ZodRawShape>(t: Tool<S>) => t;

export const GUIDE = `emotiv project model (all edits are validated; invalid edits are rejected with the reason):

- Project: { fps: 30, format: "landscape" (1920x1080) | "vertical" (1080x1920), scenes: Scene[], soundtrack: {assetId, volume 0-1, fadeOut frames} | null, reference: {assetId, opacity} | null }
- Scene: { id, name, duration (frames, 30 fps), background, transition: {type: none|fade|slide|wipe|flip, duration frames} (transition INTO this scene), elements: Element[] }
  Background: {type:"color", color} | {type:"gradient", from, to, angle} | {type:"image", assetId, dim 0-1, kenBurns} | {type:"video", assetId, dim, playbackRate, trimBefore frames, loop}
- Element (later in the array draws on top). Shared fields:
  x, y = centre as % of frame (0-100); width = % of frame width; rotation deg; opacity 0-1;
  start = frames from scene start; duration = frames or null (until scene end);
  animIn: {preset, duration, delay, easing, split, stagger, distance px}; animOut: {preset, duration, easing, distance}; loop: none|float|pulse|flicker
  presets: none fade slideUp slideDown slideLeft slideRight scale pop blur maskUp tracking rotate wipeRight typewriter
  easing: linear easeOut easeInOut back spring; split (text only): none words chars lines; stagger = frames between units
  - text: text (\\n for new lines), fontFamily, fontSize px (on the 1080 px short side), fontWeight 100-900, italic, uppercase, color "#rrggbb", align left|center|right, letterSpacing em, lineHeight, strokeColor, strokeWidth, glow px, glowColor, boxColor (or null), boxPadding, counter {from, to, decimals, prefix, suffix, duration} | null
  - shape: shape rect|ellipse, height % of frame height, color (8-digit hex allowed for alpha), radius px, borderColor, borderWidth
  - image: assetId, fit contain|cover
  - lottie: assetId, playbackRate, repeat, offset (frames into the animation)
- Colours are hex. Fonts: uploaded font assets' "family", or system fonts (Arial, Helvetica, Georgia, Times New Roman, Courier New, Impact, Verdana, Trebuchet MS).
- Vertical frames are narrower: keep text width <= 90% and scale headline sizes down (~0.7x).
- doc.source (if set) describes what the project was rebuilt from, e.g. the original After Effects comp: its size, fps, duration, layer names/types and text. Use it when asked to rebuild or match the original.
- doc.reference (if set) is the old video shown as a tracing overlay in the editor; it is never exported.
Workflow: get_project → make targeted edits (update_element / update_scene / add_element / add_scene) → preview_frame to check layout → summarise.`;

const ok = (text: string, data?: unknown): ToolResult => ({ text: data === undefined ? text : `${text}\n${JSON.stringify(data, null, 2)}` });
const fail = (text: string): ToolResult => ({ text, isError: true });

function describeError(err: unknown): string {
  if (err instanceof z.ZodError) {
    return "Rejected: " + err.issues.slice(0, 6).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
  }
  return err instanceof Error ? err.message : String(err);
}

function withProject(projectId: string, fn: (doc: ProjectDoc) => ProjectDoc | string, summary: string): ToolResult {
  const project = getProject(projectId);
  if (!project) return fail(`No project with id ${projectId}. Use list_projects.`);
  try {
    const next = fn(structuredClone(project.doc));
    if (typeof next === "string") return fail(next);
    updateProject(projectId, { doc: projectDoc.parse(next) });
    return ok(summary);
  } catch (err) {
    return fail(describeError(err));
  }
}

const findScene = (doc: ProjectDoc, sceneId: string) => doc.scenes.find((s) => s.id === sceneId || s.name === sceneId);

export const TOOLS = [
  tool({
    name: "get_guide",
    description: "How emotiv projects are structured: fields, units, animation presets. Read this before editing.",
    input: {},
    handler: () => ok(GUIDE),
  }),
  tool({
    name: "list_projects",
    description: "List all emotiv projects (id, name, format, scene count, duration).",
    input: {},
    handler: () => ok("Projects:", listProjects().map(({ id, name, format, sceneCount, durationInFrames }) => ({ id, name, format, sceneCount, seconds: durationInFrames / 30 }))),
  }),
  tool({
    name: "get_project",
    description: "Full project: document JSON, scene timings on the timeline, and available assets (ids, kinds, font families).",
    input: { projectId: z.string() },
    handler: ({ projectId }) => {
      const p = getProject(projectId);
      if (!p) return fail(`No project with id ${projectId}.`);
      const timings = getSceneTimings(p.doc).map((t, i) => ({ scene: p.doc.scenes[i].name, id: t.sceneId, from: t.from, duration: t.duration }));
      const assets = listAssets(projectId).map((a) => ({ id: a.id, kind: a.kind, name: a.name, family: a.family, seconds: a.durationInSeconds, width: a.width, height: a.height }));
      return ok(`"${p.name}" · ${p.format} · ${getTotalDuration(p.doc)} frames`, { timings, assets, doc: p.doc });
    },
  }),
  tool({
    name: "create_project",
    description: "Create a new project from a built-in template (see list_templates). Returns its id.",
    input: {
      name: z.string().max(100),
      format: z.enum(["landscape", "vertical"]).default("landscape"),
      templateId: z.string().default("kinetic-title"),
    },
    handler: ({ name, format, templateId }) => {
      const t = getBuiltinTemplate(templateId) ?? getBuiltinTemplate("blank")!;
      const p = createProject(name, projectDoc.parse({ format, scenes: [t.build(format)] }));
      return ok(`Created "${p.name}" (${p.id}).`);
    },
  }),
  tool({
    name: "save_project",
    description: "Replace the whole project document (for large restructures). Prefer the targeted tools for small edits.",
    input: { projectId: z.string(), doc: z.any(), name: z.string().max(100).optional() },
    handler: ({ projectId, doc, name }) => {
      if (!getProject(projectId)) return fail(`No project with id ${projectId}.`);
      try {
        updateProject(projectId, { doc: projectDoc.parse(doc), name });
        return ok("Saved.");
      } catch (err) {
        return fail(describeError(err));
      }
    },
  }),
  tool({
    name: "update_scene",
    description: "Change scene fields: name, duration, background (replaced whole), transition (replaced whole). sceneId may be the id or the scene name.",
    input: { projectId: z.string(), sceneId: z.string(), patch: z.record(z.string(), z.any()) },
    handler: ({ projectId, sceneId, patch }) =>
      withProject(projectId, (doc) => {
        const s = findScene(doc, sceneId);
        if (!s) return `No scene "${sceneId}".`;
        const { id: _id, elements: _e, ...rest } = patch;
        Object.assign(s, rest);
        return doc;
      }, `Updated scene "${sceneId}".`),
  }),
  tool({
    name: "update_element",
    description: "Change element fields. animIn/animOut/counter are merged, everything else replaced. elementId may be the id or the layer name.",
    input: { projectId: z.string(), sceneId: z.string(), elementId: z.string(), patch: z.record(z.string(), z.any()) },
    handler: ({ projectId, sceneId, elementId, patch }) =>
      withProject(projectId, (doc) => {
        const s = findScene(doc, sceneId);
        const el = s?.elements.find((e) => e.id === elementId || e.name === elementId);
        if (!s || !el) return `No element "${elementId}" in scene "${sceneId}".`;
        const { id: _id, type: _type, animIn, animOut, counter, ...rest } = patch;
        Object.assign(el, rest);
        if (animIn) el.animIn = { ...el.animIn, ...animIn };
        if (animOut) el.animOut = { ...el.animOut, ...animOut };
        if (counter !== undefined && el.type === "text") el.counter = counter === null ? null : { ...(el.counter ?? { from: 0, to: 100, decimals: 0, prefix: "", suffix: "", duration: 45 }), ...counter };
        return doc;
      }, `Updated "${elementId}".`),
  }),
  tool({
    name: "add_element",
    description: "Add a layer to a scene. Give at least {type, ...}; missing fields get defaults. Returns the new element id.",
    input: { projectId: z.string(), sceneId: z.string(), element: z.record(z.string(), z.any()) },
    handler: ({ projectId, sceneId, element: input }) => {
      let id = "";
      const r = withProject(projectId, (doc) => {
        const s = findScene(doc, sceneId);
        if (!s) return `No scene "${sceneId}".`;
        const el = element.parse({ ...input, id: newId("el") }) as SceneElement;
        id = el.id;
        s.elements.push(el);
        return doc;
      }, "");
      return r.isError ? r : ok(`Added element ${id}.`);
    },
  }),
  tool({
    name: "add_scene",
    description: "Add a scene, either from a template (templateId from list_templates) or from a full scene object. Inserted after afterSceneId, or at the end.",
    input: {
      projectId: z.string(),
      templateId: z.string().optional(),
      scene: z.record(z.string(), z.any()).optional(),
      afterSceneId: z.string().optional(),
    },
    handler: ({ projectId, templateId, scene, afterSceneId }) => {
      let id = "";
      const r = withProject(projectId, (doc) => {
        let s;
        if (scene) s = cloneScene(sceneSchema.parse({ id: "tmp", ...scene }));
        else {
          const builtin = templateId ? getBuiltinTemplate(templateId) : getBuiltinTemplate("blank");
          const custom = !builtin && templateId ? listCustomTemplates().find((t) => t.id === templateId) : undefined;
          if (!builtin && !custom) return `No template "${templateId}".`;
          s = builtin ? builtin.build(doc.format) : cloneScene(custom!.scene);
        }
        id = s.id;
        const after = afterSceneId ? findScene(doc, afterSceneId)?.id : undefined;
        return addScene(doc, s, after);
      }, "");
      return r.isError ? r : ok(`Added scene ${id}.`);
    },
  }),
  tool({
    name: "remove",
    description: "Remove an element (give elementId) or a whole scene (omit elementId). A project keeps at least one scene.",
    input: { projectId: z.string(), sceneId: z.string(), elementId: z.string().optional() },
    handler: ({ projectId, sceneId, elementId }) =>
      withProject(projectId, (doc) => {
        const s = findScene(doc, sceneId);
        if (!s) return `No scene "${sceneId}".`;
        if (elementId) {
          const el = s.elements.find((e) => e.id === elementId || e.name === elementId);
          if (!el) return `No element "${elementId}".`;
          return removeElement(doc, s.id, el.id);
        }
        if (doc.scenes.length <= 1) return "Can't remove the only scene.";
        return removeScene(doc, s.id);
      }, "Removed."),
  }),
  tool({
    name: "move_scene",
    description: "Move a scene earlier (delta -1) or later (delta 1).",
    input: { projectId: z.string(), sceneId: z.string(), delta: z.number().int() },
    handler: ({ projectId, sceneId, delta }) =>
      withProject(projectId, (doc) => {
        const s = findScene(doc, sceneId);
        return s ? moveScene(doc, s.id, delta) : `No scene "${sceneId}".`;
      }, "Moved."),
  }),
  tool({
    name: "list_templates",
    description: "Built-in animation templates and saved custom templates, usable with add_scene / create_project.",
    input: {},
    handler: () =>
      ok("Templates:", [
        ...BUILTIN_TEMPLATES.map(({ id, name, description }) => ({ id, name, description })),
        ...listCustomTemplates().map(({ id, name }) => ({ id, name, description: "custom" })),
      ]),
  }),
  tool({
    name: "import_asset",
    description: "Copy a local file (absolute path) into the project's assets: MP4, PNG/JPG/WebP/GIF, MP3/WAV/M4A/OGG, TTF/OTF/WOFF, Lottie JSON.",
    input: { projectId: z.string(), filePath: z.string() },
    handler: async ({ projectId, filePath }) => {
      if (!getProject(projectId)) return fail(`No project with id ${projectId}.`);
      if (!path.isAbsolute(filePath)) return fail("Give an absolute file path.");
      try {
        const a = await storeUpload(projectId, path.basename(filePath), await fs.promises.readFile(filePath));
        return ok(`Imported ${a.kind} "${a.name}" as asset ${a.id}${a.family ? ` (font family "${a.family}")` : ""}.`);
      } catch (err) {
        return fail(describeError(err));
      }
    },
  }),
  tool({
    name: "preview_frame",
    description: "Render one frame of the project as an image so you can check layout and styling. frame is on the project timeline (see timings in get_project).",
    input: { projectId: z.string(), frame: z.number().int().min(0), format: z.enum(["landscape", "vertical"]).optional() },
    handler: async ({ projectId, frame, format }) => {
      try {
        const { renderPreviewFrame } = await import("../src/lib/server/still");
        const img = await renderPreviewFrame(projectId, frame, format);
        return { text: `Frame ${frame}`, image: { data: img.toString("base64"), mimeType: "image/jpeg" } };
      } catch (err) {
        return fail(describeError(err));
      }
    },
  }),
  tool({
    name: "render_video",
    description: "Queue an MP4 export. The background worker renders it; check with render_status.",
    input: {
      projectId: z.string(),
      format: z.enum(["landscape", "vertical"]).optional(),
      quality: z.enum(["draft", "standard", "high"]).default("standard"),
    },
    handler: ({ projectId, format, quality }) => {
      const p = getProject(projectId);
      if (!p) return fail(`No project with id ${projectId}.`);
      const job = enqueueRender(projectId, format ?? p.format, quality);
      return ok(`Queued render ${job.id} (${job.format}, ${job.quality}). The user can download it from the Export tab.`);
    },
  }),
  tool({
    name: "render_status",
    description: "Status of a render (renderId) or the latest renders of a project (projectId).",
    input: { renderId: z.string().optional(), projectId: z.string().optional() },
    handler: ({ renderId, projectId }) => {
      if (renderId) {
        const j = getRender(renderId);
        return j ? ok("Render:", j) : fail("No such render.");
      }
      return ok("Renders:", listRenders(projectId, 5));
    },
  }),
  tool({
    name: "set_captions",
    description:
      "Save the post text shown with copy buttons next to the project's exports. Give any of: youtubeTitle (<=100 chars), youtubeDescription, tiktok, snapchat (<=160 chars). Omitted fields keep their value; returns the saved captions.",
    input: {
      projectId: z.string(),
      youtubeTitle: z.string().max(200).optional(),
      youtubeDescription: z.string().max(5000).optional(),
      tiktok: z.string().max(5000).optional(),
      snapchat: z.string().max(5000).optional(),
    },
    handler: ({ projectId, ...patch }) => {
      const saved = updateCaptions(projectId, patch);
      return saved ? ok("Saved captions:", saved) : fail(`No project with id ${projectId}.`);
    },
  }),
];
