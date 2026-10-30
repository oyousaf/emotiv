import fs from "node:fs";
import path from "node:path";
import { blankDoc } from "../templates";
import { EXAMPLE_NAME, exampleDoc } from "../example";
import type { ProjectRecord } from "../types";
import { getDataDir } from "./paths";
import { createProject, deleteProject, listProjects, updateProject } from "./repo";
import { storeUpload } from "./uploads";

const EXAMPLE_DIR = path.join(process.cwd(), "examples", "neon-launch");
const MARKER = () => path.join(getDataDir(), ".example-seeded");

/**
 * Create the example project from the files in examples/neon-launch. Assets
 * go through the normal upload validation, exactly like a user upload.
 */
export async function createExampleProject(): Promise<ProjectRecord> {
  const project = createProject(EXAMPLE_NAME, blankDoc());
  try {
    const load = (file: string) => storeUpload(project.id, file, fs.readFileSync(path.join(EXAMPLE_DIR, file)));
    const video = await load("neon-bg.mp4");
    const image = await load("orbit-mark.png");
    const font = await load("Anton-Regular.ttf");
    const audio = await load("pulse.mp3");
    const doc = exampleDoc({
      video: video.id,
      image: image.id,
      font: font.id,
      audio: audio.id,
      fontFamily: font.family!,
    });
    return updateProject(project.id, { doc })!;
  } catch (err) {
    deleteProject(project.id);
    throw err;
  }
}

let seeding: Promise<void> | null = null;

/** Seed once per data directory; deleting the example keeps it deleted. */
export function ensureExampleProject(): Promise<void> {
  if (fs.existsSync(MARKER())) return Promise.resolve();
  // Concurrent first requests share one seeding run.
  seeding ??= (async () => {
    if (listProjects().length === 0 && fs.existsSync(EXAMPLE_DIR)) {
      await createExampleProject();
    }
    fs.writeFileSync(MARKER(), new Date().toISOString());
  })().finally(() => {
    seeding = null;
  });
  return seeding;
}
