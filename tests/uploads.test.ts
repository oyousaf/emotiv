import fs from "node:fs";
import { afterAll, describe, expect, it } from "vitest";
import { UPLOAD_EXTENSIONS } from "@/components/editor/AssetsPanel";
import { createProject } from "@/lib/server/repo";
import { assetPath } from "@/lib/server/paths";
import { cleanDisplayName, fontFamilyFromName, storeUpload, UPLOAD_RULES, UploadError, validateUpload } from "@/lib/server/uploads";
import { blankDoc } from "@/lib/templates";
import { exampleFile, useTempDataDir } from "./helpers";

const tmp = useTempDataDir();
afterAll(tmp.cleanup);

describe("upload validation", () => {
  it("accepts real files and reads media metadata", async () => {
    const video = await validateUpload("bg.mp4", exampleFile("neon-bg.mp4"));
    expect(video.rule.kind).toBe("video");
    expect(video.width).toBe(1280);
    expect(video.durationInSeconds).toBeCloseTo(6, 0);
    const audio = await validateUpload("pulse.mp3", exampleFile("pulse.mp3"));
    expect(audio.rule.kind).toBe("audio");
    expect(audio.durationInSeconds).toBeGreaterThan(19);
    expect((await validateUpload("logo.PNG", exampleFile("orbit-mark.png"))).rule.kind).toBe("image");
    expect((await validateUpload("Anton-Regular.ttf", exampleFile("Anton-Regular.ttf"))).rule.kind).toBe("font");
  });

  it("rejects disallowed extensions", async () => {
    await expect(validateUpload("x.svg", Buffer.from("<svg/>"))).rejects.toMatchObject({ status: 415 });
    await expect(validateUpload("x.exe", Buffer.from("MZ"))).rejects.toThrow(UploadError);
    await expect(validateUpload("noext", Buffer.from("x"))).rejects.toThrow(UploadError);
  });

  it("rejects files whose contents don't match the extension", async () => {
    await expect(validateUpload("fake.png", exampleFile("Anton-Regular.ttf"))).rejects.toThrow(/look like/);
    await expect(validateUpload("fake.mp4", exampleFile("orbit-mark.png"))).rejects.toThrow(UploadError);
  });

  it("rejects truncated media that only has valid magic bytes", async () => {
    const head = exampleFile("neon-bg.mp4").subarray(0, 64);
    await expect(validateUpload("broken.mp4", head)).rejects.toMatchObject({ status: 422 });
  });

  it("rejects empty files", async () => {
    await expect(validateUpload("a.png", Buffer.alloc(0))).rejects.toThrow(/empty/);
  });

  it("cleans names", () => {
    expect(cleanDisplayName("../../evil/<b>name.png")).toBe("bname.png");
    expect(cleanDisplayName("C:\\Users\\me\\clip.mp4")).toBe("clip.mp4");
    expect(fontFamilyFromName("Anton-Regular.ttf")).toBe("Anton");
    expect(fontFamilyFromName('Bad"; }.otf')).toBe("Bad");
  });

  it("stores under a generated name inside the project folder", async () => {
    const p = createProject("Uploads", blankDoc());
    const asset = await storeUpload(p.id, "../../../../escape.png", exampleFile("orbit-mark.png"));
    expect(asset.fileName).toMatch(/^ast_[a-f0-9]+\.png$/);
    expect(asset.name).toBe("escape.png");
    expect(fs.existsSync(assetPath(p.id, asset.fileName))).toBe(true);
  });

  it("keeps the client accept list in sync with the server rules", () => {
    expect([...UPLOAD_EXTENSIONS].sort()).toEqual(Object.keys(UPLOAD_RULES).sort());
  });
});
