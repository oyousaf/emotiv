import { z } from "zod";

/**
 * The project document. Everything the compositions render comes from this
 * shape, so it is shared by the editor, the API, the database layer and the
 * render worker. Positions are percentages of the frame so a project can be
 * re-targeted between 1920x1080 and 1080x1920; sizes are pixels on the short
 * (1080px) side, which is the same in both formats.
 */

export const FORMATS = {
  landscape: { width: 1920, height: 1080, label: "Landscape 16:9" },
  vertical: { width: 1080, height: 1920, label: "Vertical 9:16" },
} as const;
export type FormatId = keyof typeof FORMATS;

export const ANIMATION_PRESETS = [
  "none",
  "fade",
  "slideUp",
  "slideDown",
  "slideLeft",
  "slideRight",
  "scale",
  "pop",
  "blur",
  "maskUp",
  "tracking",
  "rotate",
  "wipeRight",
  "typewriter",
] as const;
export type AnimationPreset = (typeof ANIMATION_PRESETS)[number];

export const EASINGS = ["linear", "easeOut", "easeInOut", "back", "spring"] as const;
export type EasingName = (typeof EASINGS)[number];

export const SPLIT_MODES = ["none", "words", "chars", "lines"] as const;
export const LOOP_MODES = ["none", "float", "pulse", "flicker"] as const;
export const TRANSITIONS = ["none", "fade", "slide", "wipe", "flip"] as const;

const id = z.string().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/);
const color = z
  .string()
  .regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/, "Use a hex colour like #ff2e88");
const frames = z.number().int().min(1).max(30 * 60 * 10);
const pct = z.number().min(-100).max(200);
/** Font family names are interpolated into CSS, so keep them boring. */
export const fontFamily = z.string().min(1).max(64).regex(/^[A-Za-z0-9 _-]+$/);

export const animationIn = z.object({
  preset: z.enum(ANIMATION_PRESETS).default("fade"),
  duration: frames.default(15),
  delay: z.number().int().min(0).max(3000).default(0),
  easing: z.enum(EASINGS).default("easeOut"),
  split: z.enum(SPLIT_MODES).default("none"),
  stagger: z.number().int().min(0).max(60).default(3),
  distance: z.number().min(0).max(2000).default(80),
});
export type AnimationIn = z.infer<typeof animationIn>;

export const animationOut = z.object({
  preset: z.enum(ANIMATION_PRESETS).default("fade"),
  duration: frames.default(10),
  easing: z.enum(EASINGS).default("easeInOut"),
  distance: z.number().min(0).max(2000).default(80),
});
export type AnimationOut = z.infer<typeof animationOut>;

const elementBase = {
  id,
  name: z.string().max(80).default(""),
  /** Centre of the element, as a percentage of the frame. */
  x: pct.default(50),
  y: pct.default(50),
  /** Width as a percentage of the frame width. */
  width: z.number().min(0.1).max(200).default(80),
  rotation: z.number().min(-360).max(360).default(0),
  opacity: z.number().min(0).max(1).default(1),
  /** Frames from the scene start. */
  start: z.number().int().min(0).default(0),
  /** Frames visible; null means until the end of the scene. */
  duration: frames.nullable().default(null),
  animIn: animationIn.default({ preset: "fade" } as AnimationIn),
  animOut: animationOut.default({ preset: "none" } as AnimationOut),
  loop: z.enum(LOOP_MODES).default("none"),
};

export const textElement = z.object({
  ...elementBase,
  type: z.literal("text"),
  text: z.string().max(2000),
  fontFamily: fontFamily.default("Arial"),
  fontSize: z.number().min(4).max(800).default(96),
  fontWeight: z.number().int().min(100).max(900).default(700),
  italic: z.boolean().default(false),
  uppercase: z.boolean().default(false),
  color: color.default("#ffffff"),
  align: z.enum(["left", "center", "right"]).default("center"),
  letterSpacing: z.number().min(-0.5).max(2).default(0),
  lineHeight: z.number().min(0.5).max(3).default(1.1),
  strokeColor: color.default("#000000"),
  strokeWidth: z.number().min(0).max(40).default(0),
  glow: z.number().min(0).max(200).default(0),
  glowColor: color.default("#ff2e88"),
  boxColor: color.nullable().default(null),
  boxPadding: z.number().min(0).max(200).default(24),
  /** Counts a number up across the in-animation, e.g. "0" → "250K". */
  counter: z
    .object({
      from: z.number(),
      to: z.number(),
      decimals: z.number().int().min(0).max(4).default(0),
      prefix: z.string().max(16).default(""),
      suffix: z.string().max(16).default(""),
      duration: frames.default(45),
    })
    .nullable()
    .default(null),
});
export type TextElement = z.infer<typeof textElement>;

export const shapeElement = z.object({
  ...elementBase,
  type: z.literal("shape"),
  shape: z.enum(["rect", "ellipse"]).default("rect"),
  /** Height as a percentage of the frame height. */
  height: z.number().min(0.1).max(200).default(10),
  color: color.default("#ff2e88"),
  radius: z.number().min(0).max(1000).default(0),
  borderColor: color.default("#ffffff"),
  borderWidth: z.number().min(0).max(100).default(0),
});
export type ShapeElement = z.infer<typeof shapeElement>;

export const imageElement = z.object({
  ...elementBase,
  type: z.literal("image"),
  assetId: id,
  fit: z.enum(["contain", "cover"]).default("contain"),
});
export type ImageElement = z.infer<typeof imageElement>;

/** A Bodymovin/Lottie animation, played with its original keyframes. */
export const lottieElement = z.object({
  ...elementBase,
  type: z.literal("lottie"),
  assetId: id,
  playbackRate: z.number().min(0.25).max(4).default(1),
  repeat: z.boolean().default(false),
  /** Frames (at 30 fps) to skip into the animation, e.g. one section of a long export. */
  offset: z.number().int().min(0).default(0),
});
export type LottieElement = z.infer<typeof lottieElement>;

export const element = z.discriminatedUnion("type", [textElement, shapeElement, imageElement, lottieElement]);
export type SceneElement = z.infer<typeof element>;
export type ElementType = SceneElement["type"];

export const background = z.discriminatedUnion("type", [
  z.object({ type: z.literal("color"), color }),
  z.object({
    type: z.literal("gradient"),
    from: color,
    to: color,
    angle: z.number().min(0).max(360).default(135),
  }),
  z.object({
    type: z.literal("image"),
    assetId: id,
    dim: z.number().min(0).max(1).default(0.3),
    kenBurns: z.boolean().default(true),
  }),
  z.object({
    type: z.literal("video"),
    assetId: id,
    dim: z.number().min(0).max(1).default(0.3),
    playbackRate: z.number().min(0.25).max(4).default(1),
    /** Frames to skip into the footage, so imported shots line up with the original. */
    trimBefore: z.number().int().min(0).default(0),
    loop: z.boolean().default(true),
  }),
]);
export type Background = z.infer<typeof background>;

export const scene = z.object({
  id,
  name: z.string().min(1).max(80),
  duration: frames,
  background,
  transition: z
    .object({
      type: z.enum(TRANSITIONS).default("fade"),
      duration: z.number().int().min(1).max(120).default(15),
    })
    .default({ type: "none", duration: 15 }),
  elements: z.array(element).max(100),
});
export type Scene = z.infer<typeof scene>;

export const soundtrack = z.object({
  assetId: id,
  volume: z.number().min(0).max(1).default(0.8),
  fadeOut: z.number().int().min(0).max(300).default(30),
});

export const projectDoc = z.object({
  fps: z.literal(30).default(30),
  format: z.enum(["landscape", "vertical"]).default("landscape"),
  scenes: z.array(scene).min(1).max(100),
  soundtrack: soundtrack.nullable().default(null),
  /**
   * An old video to trace over in the editor. Shown semi-transparent on top of
   * the preview only; it is never part of an export.
   */
  reference: z
    .object({ assetId: id, opacity: z.number().min(0).max(1).default(0.5) })
    .nullable()
    .default(null),
  /**
   * What the project was rebuilt from (e.g. one After Effects comp), kept so
   * the AI assistant can use the original's layer list and timings.
   */
  source: z
    .object({
      kind: z.enum(["aep", "lottie", "video"]),
      file: z.string().max(200),
      comp: z.string().max(200).nullable().default(null),
      width: z.number().nullable().default(null),
      height: z.number().nullable().default(null),
      fps: z.number().nullable().default(null),
      durationSeconds: z.number().nullable().default(null),
      layers: z.array(z.object({ name: z.string().max(200), type: z.string().max(20) })).max(500).default([]),
      texts: z.array(z.string().max(500)).max(20).default([]),
    })
    .nullable()
    .default(null),
});
export type ProjectDoc = z.infer<typeof projectDoc>;

export const ASSET_KINDS = ["video", "image", "audio", "font", "lottie"] as const;
export type AssetKind = (typeof ASSET_KINDS)[number];

/** What a composition needs to know about an asset; built server-side. */
export const resolvedAsset = z.object({
  id,
  kind: z.enum(ASSET_KINDS),
  url: z.string(),
  name: z.string(),
  family: fontFamily.nullable().default(null),
  durationInSeconds: z.number().nullable().default(null),
  width: z.number().nullable().default(null),
  height: z.number().nullable().default(null),
});
export type ResolvedAsset = z.infer<typeof resolvedAsset>;

export const compositionProps = z.object({
  doc: projectDoc,
  assets: z.record(z.string(), resolvedAsset),
  /** Overrides doc.format; lets one project export both aspect ratios. */
  format: z.enum(["landscape", "vertical"]).optional(),
  /** Editor preview only: draw doc.reference on top. Renders never set this. */
  showReference: z.boolean().optional(),
});
export type CompositionProps = z.infer<typeof compositionProps>;

export const SYSTEM_FONTS = [
  "Arial",
  "Helvetica",
  "Georgia",
  "Times New Roman",
  "Courier New",
  "Impact",
  "Verdana",
  "Trebuchet MS",
] as const;
