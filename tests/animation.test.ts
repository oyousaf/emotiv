import { describe, expect, it } from "vitest";
import { animState, IDENTITY, inAnimationLength, loopState, splitText, toTransform } from "@/remotion/animation";
import { animationIn, animationOut } from "@/lib/schema";

const base = { fps: 30, elementDuration: 60 };
const noOut = animationOut.parse({ preset: "none" });

describe("animation presets", () => {
  it("slides up from hidden to identity", () => {
    const animIn = animationIn.parse({ preset: "slideUp", duration: 10, distance: 100, easing: "linear" });
    expect(animState({ ...base, frame: 0, animIn, animOut: noOut })).toMatchObject({ opacity: 0, y: 100 });
    expect(animState({ ...base, frame: 5, animIn, animOut: noOut }).y).toBeCloseTo(50);
    expect(animState({ ...base, frame: 10, animIn, animOut: noOut })).toMatchObject({ opacity: 1, y: 0 });
  });

  it("applies the out animation at the end of the element", () => {
    const animIn = animationIn.parse({ preset: "none" });
    const animOut = animationOut.parse({ preset: "fade", duration: 10, easing: "linear" });
    expect(animState({ ...base, frame: 49, animIn, animOut }).opacity).toBe(1);
    expect(animState({ ...base, frame: 55, animIn, animOut }).opacity).toBeCloseTo(0.5);
    expect(animState({ ...base, frame: 60, animIn, animOut }).opacity).toBe(0);
  });

  it("staggers split units", () => {
    const animIn = animationIn.parse({ preset: "fade", duration: 10, stagger: 5, easing: "linear" });
    const at = (index: number) => animState({ ...base, frame: 10, animIn, animOut: noOut, unit: { index, count: 3 } }).opacity;
    expect(at(0)).toBe(1);
    expect(at(1)).toBeCloseTo(0.5);
    expect(at(2)).toBe(0);
    expect(inAnimationLength(animIn, 3)).toBe(20);
  });

  it("never overshoots opacity with springy easing", () => {
    const animIn = animationIn.parse({ preset: "pop", duration: 20, easing: "spring" });
    for (let f = 0; f < 40; f++) {
      const s = animState({ ...base, frame: f, animIn, animOut: noOut });
      expect(s.opacity).toBeGreaterThanOrEqual(0);
      expect(s.opacity).toBeLessThanOrEqual(1);
    }
  });

  it("typewriter reveals characters progressively", () => {
    const animIn = animationIn.parse({ preset: "typewriter", duration: 10, easing: "linear" });
    expect(animState({ ...base, frame: 5, animIn, animOut: noOut }).reveal).toBeCloseTo(0.5);
  });

  it("splits text by words, chars and lines", () => {
    expect(splitText("Make it move", "words")).toEqual(["Make ", "it ", "move"]);
    expect(splitText("ab", "chars")).toEqual(["a", "b"]);
    expect(splitText("a\nb", "lines")).toEqual(["a", "b"]);
    expect(splitText("same", "none")).toEqual(["same"]);
  });

  it("builds transforms and deterministic loops", () => {
    expect(toTransform(IDENTITY)).toBe("none");
    expect(toTransform({ ...IDENTITY, y: 10, scale: 2 })).toBe("translate(0px, 10px) scale(2)");
    expect(loopState("flicker", 42, 30)).toEqual(loopState("flicker", 42, 30));
  });
});
