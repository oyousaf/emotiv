import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { closeDb } from "@/lib/server/db";

/** Point the data directory at a fresh temp folder for this test file. */
export function useTempDataDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "emotiv-test-"));
  process.env.STUDIO_DATA_DIR = dir;
  return {
    dir,
    cleanup: () => {
      closeDb();
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}

export const EXAMPLE_DIR = path.join(process.cwd(), "examples", "neon-launch");
export const exampleFile = (name: string) => fs.readFileSync(path.join(EXAMPLE_DIR, name));
