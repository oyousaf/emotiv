import { afterAll, describe, expect, it } from "vitest";
import { frameDiff, pickCuts } from "@/components/import/detect-cuts";
import { importProject } from "@/lib/server/import";
import { cutsToShots, extractAudio } from "@/lib/server/import-video";
import { listAssets } from "@/lib/server/repo";
import { validateUpload } from "@/lib/server/uploads";
import { simpleLottie } from "./fixtures/lottie";
import { EXAMPLE_DIR, exampleFile, useTempDataDir } from "./helpers";

const tmp = useTempDataDir();
afterAll(tmp.cleanup);

const lottieFile = () => ({ name: "promo.json", buf: Buffer.from(JSON.stringify(simpleLottie())) });

describe("shot detection maths", () => {
  it("scores frame differences", () => {
    expect(frameDiff(new Uint8ClampedArray([0, 0]), new Uint8ClampedArray([255, 255]))).toBe(255);
    expect(frameDiff(new Uint8ClampedArray([10, 20]), new Uint8ClampedArray([10, 20]))).toBe(0);
  });

  it("finds hard cuts but ignores steady motion", () => {
    const scores = [0, 3, 4, 3, 90, 4, 3, 5, 4, 3, 4, 80, 3, 2];
    expect(pickCuts(scores)).toEqual([4, 11]);
    expect(pickCuts([0, 30, 32, 31, 33, 30, 31, 32])).toEqual([]);
  });

  it("turns cut times into shots and folds away flash frames", () => {
    expect(cutsToShots([2, 4], 6)).toEqual([
      { start: 0, duration: 60 },
      { start: 60, duration: 60 },
      { start: 120, duration: 60 },
    ]);
    expect(cutsToShots([2, 2.1], 4)).toEqual([
      { start: 0, duration: 63 },
      { start: 63, duration: 57 },
    ]);
    expect(cutsToShots([0.1], 3)).toEqual([{ start: 0, duration: 90 }]);
    expect(cutsToShots([], 2.5)).toEqual([{ start: 0, duration: 75 }]);
  });
});

describe("audio extraction (Remotion's bundled ffmpeg)", () => {
  it("extracts a soundtrack, or returns null for silent video", async () => {
    const audio = await extractAudio(`${EXAMPLE_DIR}/pulse.mp3`);
    expect(audio).not.toBeNull();
    expect((await validateUpload("a.m4a", audio!)).durationInSeconds).toBeCloseTo(20, 0);
    expect(await extractAudio(`${EXAMPLE_DIR}/neon-bg.mp4`)).toBeNull();
  });
});

describe("importProject", () => {
  it("builds one scene per shot from an old video, with a tracing reference", async () => {
    const { project, report } = await importProject({ video: { name: "old-promo.mp4", buf: exampleFile("neon-bg.mp4") } }, { cuts: [2, 4], keepFootage: true });
    expect(project.name).toBe("old-promo");
    expect(report.shots).toBe(3);
    expect(project.doc.scenes.map((s) => s.duration)).toEqual([60, 60, 60]);
    const bg = project.doc.scenes[1].background;
    expect(bg).toMatchObject({ type: "video", trimBefore: 60, loop: false, dim: 0 });
    expect(project.doc.reference?.opacity).toBe(0.5);
    expect(report.audio).toBe(false);
    expect(report.notes.join(" ")).toMatch(/no audio/);
  });

  it("builds editable scenes from a Lottie export and stores the leftover graphics", async () => {
    const { project, report } = await importProject(
      { lottie: lottieFile(), extras: [{ name: "Anton-Regular.ttf", buf: exampleFile("Anton-Regular.ttf") }] },
      { mode: "hybrid" },
    );
    const assets = listAssets(project.id);
    expect(assets.map((a) => a.kind).sort()).toEqual(["font", "lottie", "lottie"]);
    expect(report.lottie?.fonts).toEqual([{ family: "Anton", found: true }]);
    const graphics = project.doc.scenes[0].elements[0];
    expect(graphics.type).toBe("lottie");
    expect(assets.some((a) => a.id === (graphics as { assetId: string }).assetId && a.name === "promo graphics.json")).toBe(true);
  });

  it("uses the Lottie for scenes and the video as reference when given both", async () => {
    const { project, report } = await importProject({ lottie: lottieFile(), video: { name: "old.mp4", buf: exampleFile("neon-bg.mp4") } }, { mode: "exact" });
    expect(report.shots).toBeNull();
    expect(report.reference).toBe(true);
    expect(project.doc.scenes[0].elements[0].type).toBe("lottie");
  });

  it("rejects After Effects project files with a pointer to Bodymovin", async () => {
    await expect(validateUpload("comp.aep", Buffer.from("RIFX"))).rejects.toThrow(/Bodymovin/);
  });

  it("rejects JSON that isn't a Lottie and cleans up the half-made project", async () => {
    await expect(importProject({ lottie: { name: "x.json", buf: Buffer.from('{"hello":1}') } })).rejects.toThrow(/Lottie/);
  });

  it("needs at least one source", async () => {
    await expect(importProject({})).rejects.toThrow(/Add an old video/);
  });
});
