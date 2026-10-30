import { describe, expect, it } from "vitest";
import { GRAPHICS_PLACEHOLDER, importLottie, SOURCE_PLACEHOLDER, valueAt } from "@/lib/importers/lottie";
import type { ShapeElement, TextElement } from "@/lib/schema";
import { sequencedLottie, simpleLottie } from "./fixtures/lottie";

describe("Lottie values", () => {
  it("reads static, animated, legacy and split properties", () => {
    expect(valueAt({ a: 0, k: [1, 2] }, 5)).toEqual([1, 2]);
    const anim = { a: 1, k: [{ t: 0, s: [0] }, { t: 10, s: [100] }] };
    expect(valueAt(anim, -5)).toEqual([0]);
    expect(valueAt(anim, 5)).toEqual([50]);
    expect(valueAt(anim, 20)).toEqual([100]);
    const legacy = { a: 1, k: [{ t: 0, s: [0], e: [10] }, { t: 10 }] };
    expect(valueAt(legacy, 5)).toEqual([5]);
    expect(valueAt(legacy, 10)).toEqual([10]);
    expect(valueAt({ s: true, x: { a: 0, k: 3 }, y: { a: 0, k: 4 }, k: 0 }, 0)).toEqual([3, 4]);
  });
});

describe("Lottie import (hybrid)", () => {
  const { doc, graphics, report } = importLottie(simpleLottie(), { mode: "hybrid", availableFamilies: ["Anton"] });
  const scene = doc.scenes[0];

  it("retimes to 30 fps and uses the full-frame solid as the background", () => {
    expect(doc.format).toBe("landscape");
    expect(doc.scenes).toHaveLength(1);
    expect(scene.duration).toBe(150);
    expect(scene.background).toEqual({ type: "color", color: "#12062b" });
    expect(report.notes.join(" ")).toMatch(/25 fps/);
  });

  it("turns text into an editable layer with the closest presets", () => {
    const t = scene.elements.find((e) => e.type === "text") as TextElement;
    expect(t.text).toBe("MAKE IT\nMOVE");
    expect(t.fontFamily).toBe("Anton");
    expect(t.fontSize).toBe(120);
    expect(t.color).toBe("#ff2e87");
    expect(t.align).toBe("center");
    expect(t.letterSpacing).toBeCloseTo(0.05);
    expect(t.x).toBeCloseTo(50);
    expect(t.animIn).toMatchObject({ preset: "slideUp", distance: 200, duration: 12 });
    expect(t.animOut).toMatchObject({ preset: "fade", duration: 12 });
  });

  it("turns a plain filled rect into a shape layer", () => {
    const s = scene.elements.find((e) => e.type === "shape") as ShapeElement;
    expect(s.name).toBe("Accent bar");
    expect(s.width).toBeCloseTo((400 / 1920) * 100, 0);
    expect(s.y).toBeCloseTo((800 / 1080) * 100, 0);
    expect(s.color).toBe("#00e6ff");
    expect(s.animIn.preset).toBe("wipeRight");
  });

  it("keeps everything else as an exact graphics layer underneath", () => {
    expect(report.keptAsGraphics).toBe(1);
    expect(graphics.layers.map((l: { nm: string }) => l.nm)).toEqual(["Swirl"]);
    expect(scene.elements[0]).toMatchObject({ type: "lottie", assetId: GRAPHICS_PLACEHOLDER, width: 100 });
    expect(report.fonts).toEqual([{ family: "Anton", found: true }]);
  });

  it("reports fonts that still need uploading", () => {
    const r = importLottie(simpleLottie(), { mode: "hybrid" }).report;
    expect(r.fonts).toEqual([{ family: "Anton", found: false }]);
    expect(r.notes.join(" ")).toMatch(/Upload these fonts/);
  });
});

describe("Lottie import (exact)", () => {
  it("plays the original untouched", () => {
    const { doc, graphics } = importLottie(simpleLottie(), { mode: "exact" });
    expect(graphics).toBeNull();
    expect(doc.scenes[0].elements).toHaveLength(1);
    expect(doc.scenes[0].elements[0]).toMatchObject({ type: "lottie", assetId: SOURCE_PLACEHOLDER, offset: 0 });
  });

  it("fits a landscape comp inside a vertical frame", () => {
    const { doc } = importLottie(simpleLottie(), { mode: "exact", format: "vertical" });
    expect(doc.format).toBe("vertical");
    expect(doc.scenes[0].elements[0].width).toBe(100);
  });
});

describe("sequenced precomps", () => {
  it("become one scene each, with the overlap as a transition", () => {
    const { doc } = importLottie(sequencedLottie(), { mode: "hybrid" });
    expect(doc.scenes.map((s) => s.name)).toEqual(["Opening", "Closing"]);
    expect(doc.scenes[1].transition).toEqual({ type: "fade", duration: 12 });
    expect(doc.scenes.map((s) => (s.elements.find((e) => e.type === "text") as TextElement).text)).toEqual(["MAKE IT\nMOVE", "MAKE IT\nMOVE"]);
    const second = doc.scenes[1].elements.find((e) => e.type === "text") as TextElement;
    expect(second.start).toBe(0);
    expect(second.animIn.preset).toBe("slideUp");
  });
});
