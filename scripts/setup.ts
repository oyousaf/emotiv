/**
 * One-time setup: create the data folder and database, download the headless
 * Chrome that Remotion renders with, and seed the example project.
 */
import { ensureBrowser } from "@remotion/renderer";
import { getDb } from "../src/lib/server/db";
import { getDataDir } from "../src/lib/server/paths";
import { ensureExampleProject } from "../src/lib/server/seed";

getDb();
console.log(`Data directory: ${getDataDir()}`);
console.log("Checking Chrome Headless Shell (downloads ~100 MB on first run)…");
await ensureBrowser();
await ensureExampleProject();
console.log("Setup complete. Run `npm run dev` and open http://localhost:3000");
