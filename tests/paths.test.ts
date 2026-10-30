import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { assetPath, isSafeFileName, PathError, projectDir, renderPath, safeJoin } from "@/lib/server/paths";
import { useTempDataDir } from "./helpers";

const tmp = useTempDataDir();
afterAll(tmp.cleanup);

describe("path safety", () => {
  it("keeps joins inside the base directory", () => {
    expect(safeJoin(tmp.dir, "a", "b.txt")).toBe(path.join(tmp.dir, "a", "b.txt"));
    expect(() => safeJoin(tmp.dir, "..", "x")).toThrow(PathError);
    expect(() => safeJoin(tmp.dir, "a/../../x")).toThrow(PathError);
    expect(() => safeJoin(tmp.dir, path.resolve("/etc/passwd"))).toThrow(PathError);
    expect(() => safeJoin(tmp.dir, "")).toThrow(PathError);
  });

  it("rejects unsafe project ids", () => {
    expect(projectDir("prj_abc")).toBe(path.join(tmp.dir, "projects", "prj_abc"));
    for (const bad of ["..", "../x", "a/b", "a\\b", "", "x".repeat(65), "C:"]) {
      expect(() => projectDir(bad), bad).toThrow(PathError);
    }
  });

  it("only allows generated-style file names", () => {
    expect(isSafeFileName("ast_123.mp4")).toBe(true);
    for (const bad of ["../a.mp4", "a.mp4/..", "a", ".mp4", "a b.mp4", "a.MP4"]) {
      expect(isSafeFileName(bad), bad).toBe(false);
    }
    expect(() => assetPath("prj_a", "../../studio.db")).toThrow(PathError);
    expect(() => renderPath("..\\studio.db")).toThrow(PathError);
  });
});
