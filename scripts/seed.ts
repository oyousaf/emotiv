/** Add a fresh copy of the example project (even if one already exists). */
import { createExampleProject } from "../src/lib/server/seed";

const project = await createExampleProject();
console.log(`Created "${project.name}" (${project.id})`);
