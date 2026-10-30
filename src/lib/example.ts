import { projectDoc, type ProjectDoc } from "./schema";
import { newId, shape, text } from "./templates";

export type ExampleAssetIds = { video: string; image: string; font: string; audio: string; fontFamily: string };

export const EXAMPLE_NAME = "Neon Launch (After Effects rebuild)";

/**
 * The bundled example: a 15-second launch promo of the kind that used to be
 * built from After Effects text presets: masked kinetic type over a looping
 * background, a line-by-line feature list, a counting stat, a social caption
 * and a logo sting, scored with a soundtrack.
 */
export function exampleDoc(ids: ExampleAssetIds): ProjectDoc {
  const display = ids.fontFamily;
  return projectDoc.parse({
    fps: 30,
    format: "landscape",
    soundtrack: { assetId: ids.audio, volume: 0.7, fadeOut: 30 },
    scenes: [
      {
        id: newId("sc"),
        name: "Intro",
        duration: 120,
        background: { type: "video", assetId: ids.video, dim: 0.25, playbackRate: 1 },
        transition: { type: "none", duration: 15 },
        elements: [
          text({
            name: "Headline",
            text: "NEON\nLAUNCH",
            y: 44,
            fontFamily: display,
            fontSize: 230,
            fontWeight: 400,
            lineHeight: 0.92,
            letterSpacing: 0.02,
            glow: 60,
            glowColor: "#ff2e88",
            animIn: { preset: "maskUp", split: "lines", stagger: 6, duration: 20, easing: "easeOut", delay: 6 },
            animOut: { preset: "blur", duration: 12 },
          }),
          text({
            name: "Subtitle",
            text: "Spring drop · 2026",
            y: 76,
            fontSize: 44,
            fontWeight: 600,
            uppercase: true,
            letterSpacing: 0.35,
            color: "#9ef0ff",
            start: 30,
            animIn: { preset: "tracking", duration: 34 },
            animOut: { preset: "fade", duration: 10 },
          }),
          shape({
            name: "Rule",
            y: 68,
            width: 18,
            height: 0.6,
            color: "#ff2e88",
            start: 24,
            animIn: { preset: "wipeRight", duration: 18, easing: "easeInOut" },
            animOut: { preset: "fade", duration: 10 },
          }),
        ],
      },
      {
        id: newId("sc"),
        name: "Features",
        duration: 105,
        background: { type: "gradient", from: "#12062b", to: "#5b12a8", angle: 135 },
        transition: { type: "slide", duration: 15 },
        elements: [
          text({
            name: "Feature list",
            text: "Faster renders.\nBolder type.\nZero cloud.",
            x: 50,
            y: 50,
            width: 70,
            align: "left",
            fontFamily: display,
            fontSize: 150,
            fontWeight: 400,
            lineHeight: 1.05,
            animIn: { preset: "slideUp", split: "lines", stagger: 10, duration: 16, distance: 60, easing: "back" },
            animOut: { preset: "fade", duration: 10 },
          }),
          shape({
            name: "Accent",
            x: 12,
            y: 50,
            width: 0.8,
            height: 52,
            color: "#00e5ff",
            animIn: { preset: "scale", duration: 14 },
            animOut: { preset: "fade", duration: 10 },
          }),
        ],
      },
      {
        id: newId("sc"),
        name: "Stat",
        duration: 105,
        background: { type: "gradient", from: "#001a2c", to: "#003b5c", angle: 160 },
        transition: { type: "wipe", duration: 15 },
        elements: [
          text({
            name: "Number",
            text: "12000",
            y: 44,
            fontFamily: display,
            fontSize: 300,
            fontWeight: 400,
            color: "#00e5ff",
            glow: 50,
            glowColor: "#00b8d9",
            counter: { from: 0, to: 12000, decimals: 0, prefix: "", suffix: "+", duration: 55 },
            animIn: { preset: "pop", duration: 22, easing: "spring" },
            animOut: { preset: "scale", duration: 10 },
          }),
          text({
            name: "Label",
            text: "creators on the waitlist",
            y: 68,
            fontSize: 56,
            fontWeight: 500,
            start: 14,
            animIn: { preset: "slideUp", duration: 16, distance: 40 },
            animOut: { preset: "fade", duration: 8 },
          }),
        ],
      },
      {
        id: newId("sc"),
        name: "Caption",
        duration: 75,
        background: { type: "gradient", from: "#ff2e88", to: "#ff9a3c", angle: 200 },
        transition: { type: "slide", duration: 12 },
        elements: [
          text({
            name: "Caption",
            text: "TAP TO JOIN",
            y: 50,
            fontFamily: display,
            fontSize: 170,
            fontWeight: 400,
            color: "#111111",
            boxColor: "#ffffff",
            boxPadding: 44,
            rotation: -3,
            animIn: { preset: "pop", split: "chars", stagger: 2, duration: 14, easing: "back" },
            animOut: { preset: "scale", duration: 8 },
            loop: "pulse",
          }),
        ],
      },
      {
        id: newId("sc"),
        name: "Logo sting",
        duration: 105,
        background: { type: "video", assetId: ids.video, dim: 0.55, playbackRate: 0.5 },
        transition: { type: "fade", duration: 18 },
        elements: [
          {
            id: newId("el"),
            type: "image",
            name: "Logo mark",
            assetId: ids.image,
            x: 50,
            y: 40,
            width: 18,
            animIn: { preset: "pop", duration: 26, easing: "spring" },
            animOut: { preset: "none" },
            loop: "float",
          },
          text({
            name: "Wordmark",
            text: "NEON",
            y: 74,
            fontFamily: display,
            fontSize: 120,
            fontWeight: 400,
            letterSpacing: 0.4,
            start: 16,
            animIn: { preset: "tracking", duration: 30 },
          }),
        ],
      },
    ],
  });
}
