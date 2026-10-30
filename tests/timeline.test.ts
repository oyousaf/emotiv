import { describe, expect, it } from "vitest";
import { sceneAtFrame } from "@/lib/doc-ops";
import type { ProjectDoc, Scene } from "@/lib/schema";
import { elementWindow, framesToTimecode, getSceneTimings, getTotalDuration } from "@/lib/timeline";
import { text } from "@/lib/templates";

const mk = (id: string, duration: number, t: Scene["transition"]["type"] = "fade", td = 15): Scene => ({
  id,
  name: id,
  duration,
  background: { type: "color", color: "#000000" },
  transition: { type: t, duration: td },
  elements: [],
});

describe("timeline", () => {
  it("overlaps scenes by their incoming transition", () => {
    const doc = { scenes: [mk("a", 100), mk("b", 100), mk("c", 50, "none")] };
    expect(getSceneTimings(doc)).toEqual([
      { sceneId: "a", from: 0, duration: 100, transitionIn: 0 },
      { sceneId: "b", from: 85, duration: 100, transitionIn: 15 },
      { sceneId: "c", from: 185, duration: 50, transitionIn: 0 },
    ]);
    expect(getTotalDuration(doc)).toBe(235);
  });

  it("clamps transitions longer than a neighbouring scene", () => {
    const doc = { scenes: [mk("a", 10), mk("b", 100, "fade", 60)] };
    expect(getSceneTimings(doc)[1].transitionIn).toBe(9);
  });

  it("finds the scene on screen at a frame", () => {
    const doc = { scenes: [mk("a", 100), mk("b", 100)] } as ProjectDoc;
    expect(sceneAtFrame(doc, 0)).toBe("a");
    expect(sceneAtFrame(doc, 84)).toBe("a");
    expect(sceneAtFrame(doc, 85)).toBe("b");
  });

  it("limits element windows to the scene", () => {
    expect(elementWindow(text({ text: "x", start: 10, duration: null }), 60)).toEqual({ start: 10, duration: 50 });
    expect(elementWindow(text({ text: "x", start: 10, duration: 500 }), 60)).toEqual({ start: 10, duration: 50 });
    expect(elementWindow(text({ text: "x", start: 90 }), 60)).toEqual({ start: 59, duration: 1 });
  });

  it("formats timecode", () => {
    expect(framesToTimecode(0, 30)).toBe("00:00:00");
    expect(framesToTimecode(95, 30)).toBe("00:03:05");
    expect(framesToTimecode(30 * 61, 30)).toBe("01:01:00");
  });
});
