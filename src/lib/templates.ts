import {
  animationIn,
  animationOut,
  projectDoc,
  scene as sceneSchema,
  shapeElement,
  textElement,
  type FormatId,
  type ProjectDoc,
  type Scene,
  type SceneElement,
  type ShapeElement,
  type TextElement,
} from "./schema";

/** Short random id, safe in the browser, Node and inside a Remotion bundle. */
export function newId(prefix = ""): string {
  const raw = globalThis.crypto.randomUUID().replace(/-/g, "").slice(0, 10);
  return prefix ? `${prefix}_${raw}` : raw;
}

type TextInput = Partial<Omit<TextElement, "type" | "animIn" | "animOut">> & {
  text: string;
  animIn?: Partial<TextElement["animIn"]>;
  animOut?: Partial<TextElement["animOut"]>;
};
type ShapeInput = Partial<Omit<ShapeElement, "type" | "animIn" | "animOut">> & {
  animIn?: Partial<ShapeElement["animIn"]>;
  animOut?: Partial<ShapeElement["animOut"]>;
};

export function text(input: TextInput): TextElement {
  return textElement.parse({
    ...input,
    id: input.id ?? newId("el"),
    type: "text",
    animIn: animationIn.parse(input.animIn ?? {}),
    animOut: animationOut.parse(input.animOut ?? { preset: "none" }),
  });
}

export function shape(input: ShapeInput): ShapeElement {
  return shapeElement.parse({
    ...input,
    id: input.id ?? newId("el"),
    type: "shape",
    animIn: animationIn.parse(input.animIn ?? {}),
    animOut: animationOut.parse(input.animOut ?? { preset: "none" }),
  });
}

export type SceneTemplate = {
  id: string;
  name: string;
  category: "titles" | "lower-thirds" | "data" | "quotes" | "social" | "logo" | "basic" | "custom";
  description: string;
  builtin: boolean;
  build: (format: FormatId) => Scene;
};

/** Vertical frames are 1080px wide; scale type down so headlines still fit. */
const fs = (format: FormatId, px: number) => (format === "vertical" ? Math.round(px * 0.72) : px);

export const BUILTIN_TEMPLATES: SceneTemplate[] = [
  {
    id: "kinetic-title",
    name: "Kinetic Title",
    category: "titles",
    description: "Masked word-by-word headline with a tracking-in subtitle.",
    builtin: true,
    build: (format) => ({
      id: newId("sc"),
      name: "Kinetic Title",
      duration: 120,
      background: { type: "gradient", from: "#12062b", to: "#3b0f6e", angle: 135 },
      transition: { type: "fade", duration: 15 },
      elements: [
        text({
          name: "Headline",
          text: "MAKE IT\nMOVE",
          y: 44,
          fontSize: fs(format, 200),
          fontWeight: 900,
          lineHeight: 0.95,
          animIn: { preset: "maskUp", split: "words", stagger: 5, duration: 18, easing: "easeOut" },
          animOut: { preset: "fade", duration: 10 },
        }),
        text({
          name: "Subtitle",
          text: "Motion graphics, rebuilt",
          y: 68,
          fontSize: fs(format, 48),
          fontWeight: 400,
          uppercase: true,
          letterSpacing: 0.2,
          color: "#ff9bd2",
          start: 18,
          animIn: { preset: "tracking", duration: 30, easing: "easeOut" },
          animOut: { preset: "fade", duration: 10 },
        }),
      ],
    }),
  },
  {
    id: "lower-third",
    name: "Lower Third",
    category: "lower-thirds",
    description: "Accent bar wipe with name and role.",
    builtin: true,
    build: (format) => ({
      id: newId("sc"),
      name: "Lower Third",
      duration: 120,
      background: { type: "color", color: "#0b0b12" },
      transition: { type: "slide", duration: 15 },
      elements: [
        shape({
          name: "Accent bar",
          x: format === "vertical" ? 50 : 30,
          y: 76,
          width: format === "vertical" ? 84 : 40,
          height: format === "vertical" ? 9 : 16,
          color: "#ff2e88",
          radius: 6,
          animIn: { preset: "wipeRight", duration: 16, easing: "easeInOut" },
          animOut: { preset: "wipeRight", duration: 12, easing: "easeInOut" },
        }),
        text({
          name: "Name",
          text: "Alex Morgan",
          x: format === "vertical" ? 50 : 30,
          y: 73.5,
          width: format === "vertical" ? 80 : 36,
          align: "left",
          fontSize: fs(format, 72),
          fontWeight: 800,
          start: 8,
          animIn: { preset: "slideRight", distance: 60, duration: 14 },
          animOut: { preset: "fade", duration: 8 },
        }),
        text({
          name: "Role",
          text: "Creative Director",
          x: format === "vertical" ? 50 : 30,
          y: 80,
          width: format === "vertical" ? 80 : 36,
          align: "left",
          fontSize: fs(format, 36),
          fontWeight: 500,
          uppercase: true,
          letterSpacing: 0.12,
          start: 14,
          animIn: { preset: "fade", duration: 14 },
          animOut: { preset: "fade", duration: 8 },
        }),
      ],
    }),
  },
  {
    id: "stat-counter",
    name: "Stat Counter",
    category: "data",
    description: "Big number that counts up, with a label.",
    builtin: true,
    build: (format) => ({
      id: newId("sc"),
      name: "Stat Counter",
      duration: 105,
      background: { type: "gradient", from: "#001a2c", to: "#003b5c", angle: 160 },
      transition: { type: "wipe", duration: 15 },
      elements: [
        text({
          name: "Number",
          text: "0",
          y: 45,
          fontSize: fs(format, 260),
          fontWeight: 900,
          color: "#00e5ff",
          glow: 40,
          glowColor: "#00b8d9",
          counter: { from: 0, to: 250, decimals: 0, prefix: "", suffix: "K", duration: 50 },
          animIn: { preset: "pop", duration: 20, easing: "spring" },
          animOut: { preset: "scale", duration: 10 },
        }),
        text({
          name: "Label",
          text: "views in the first week",
          y: 65,
          fontSize: fs(format, 52),
          fontWeight: 500,
          start: 12,
          animIn: { preset: "slideUp", duration: 16, distance: 40 },
          animOut: { preset: "fade", duration: 8 },
        }),
      ],
    }),
  },
  {
    id: "quote-card",
    name: "Quote Card",
    category: "quotes",
    description: "Words fade in one by one, then the attribution.",
    builtin: true,
    build: (format) => ({
      id: newId("sc"),
      name: "Quote Card",
      duration: 150,
      background: { type: "color", color: "#f4efe6" },
      transition: { type: "fade", duration: 15 },
      elements: [
        text({
          name: "Quote",
          text: "“Design is not just what it looks like. Design is how it works.”",
          y: 45,
          width: format === "vertical" ? 84 : 70,
          fontFamily: "Georgia",
          fontSize: fs(format, 78),
          fontWeight: 400,
          italic: true,
          color: "#1d1a16",
          lineHeight: 1.25,
          animIn: { preset: "blur", split: "words", stagger: 3, duration: 14 },
          animOut: { preset: "fade", duration: 12 },
        }),
        text({
          name: "Attribution",
          text: "— Steve Jobs",
          y: format === "vertical" ? 68 : 72,
          fontSize: fs(format, 40),
          fontWeight: 600,
          color: "#8a5a2b",
          uppercase: true,
          letterSpacing: 0.15,
          start: 50,
          animIn: { preset: "slideUp", duration: 16, distance: 30 },
          animOut: { preset: "fade", duration: 12 },
        }),
      ],
    }),
  },
  {
    id: "caption-punch",
    name: "Caption Punch",
    category: "social",
    description: "Boxed, letter-popping caption for short-form clips.",
    builtin: true,
    build: (format) => ({
      id: newId("sc"),
      name: "Caption Punch",
      duration: 90,
      background: { type: "gradient", from: "#ff2e88", to: "#ff9a3c", angle: 200 },
      transition: { type: "slide", duration: 12 },
      elements: [
        text({
          name: "Caption",
          text: "WAIT FOR IT",
          y: 50,
          fontSize: fs(format, 140),
          fontWeight: 900,
          color: "#111111",
          boxColor: "#ffffff",
          boxPadding: 40,
          rotation: -3,
          animIn: { preset: "pop", split: "chars", stagger: 2, duration: 14, easing: "back" },
          animOut: { preset: "scale", duration: 8 },
          loop: "pulse",
        }),
      ],
    }),
  },
  {
    id: "logo-sting",
    name: "Logo Sting",
    category: "logo",
    description: "Ring burst and wordmark. Swap the rings for your logo image.",
    builtin: true,
    build: (format) => ({
      id: newId("sc"),
      name: "Logo Sting",
      duration: 90,
      background: { type: "color", color: "#07070c" },
      transition: { type: "fade", duration: 15 },
      elements: [
        shape({
          name: "Ring",
          shape: "ellipse",
          y: 42,
          width: format === "vertical" ? 40 : 22.5,
          height: format === "vertical" ? 22.5 : 40,
          color: "#00000000",
          borderColor: "#00e5ff",
          borderWidth: 14,
          animIn: { preset: "pop", duration: 24, easing: "spring" },
          animOut: { preset: "scale", duration: 10 },
          loop: "pulse",
        }),
        text({
          name: "Wordmark",
          text: "STUDIO",
          y: format === "vertical" ? 62 : 72,
          fontSize: fs(format, 110),
          fontWeight: 900,
          letterSpacing: 0.3,
          start: 14,
          animIn: { preset: "tracking", duration: 28 },
          animOut: { preset: "fade", duration: 10 },
        }),
      ],
    }),
  },
  {
    id: "blank",
    name: "Blank",
    category: "basic",
    description: "Empty scene with one text layer.",
    builtin: true,
    build: (format) => ({
      id: newId("sc"),
      name: "Scene",
      duration: 90,
      background: { type: "color", color: "#111118" },
      transition: { type: "fade", duration: 15 },
      elements: [text({ name: "Text", text: "Your text", fontSize: fs(format, 120) })],
    }),
  },
];

export function getBuiltinTemplate(id: string) {
  return BUILTIN_TEMPLATES.find((t) => t.id === id);
}

/** Give a scene (e.g. one stored as a custom template) fresh ids throughout. */
export function cloneScene(scene: Scene): Scene {
  const copy = sceneSchema.parse(structuredClone(scene));
  copy.id = newId("sc");
  copy.elements = copy.elements.map((el) => ({ ...el, id: newId("el") }) as SceneElement);
  return copy;
}

export function blankDoc(format: FormatId = "landscape"): ProjectDoc {
  return projectDoc.parse({ format, scenes: [getBuiltinTemplate("kinetic-title")!.build(format)] });
}
