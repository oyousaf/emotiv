import { z } from "zod";
import { cloneScene, getBuiltinTemplate } from "@/lib/templates";
import { projectDoc } from "@/lib/schema";
import { handle, json } from "@/lib/server/http";
import { createProject, listCustomTemplates, listProjects } from "@/lib/server/repo";

export const GET = handle(() => json(listProjects()));

const createBody = z.object({
  name: z.string().max(100).default("Untitled project"),
  format: z.enum(["landscape", "vertical"]).default("landscape"),
  templateId: z.string().max(64).default("kinetic-title"),
});

export const POST = handle(async (req: Request) => {
  const { name, format, templateId } = createBody.parse(await req.json());
  const builtin = getBuiltinTemplate(templateId);
  const custom = builtin ? null : listCustomTemplates().find((t) => t.id === templateId);
  const first = builtin
    ? builtin.build(format)
    : custom
      ? cloneScene(custom.scene)
      : getBuiltinTemplate("blank")!.build(format);
  const project = createProject(name, projectDoc.parse({ format, scenes: [first] }));
  return json(project, 201);
});
