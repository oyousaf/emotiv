import { z } from "zod";
import { projectDoc } from "@/lib/schema";
import { handle, json, notFound, type Ctx } from "@/lib/server/http";
import { deleteProject, getProject, listAssets, updateProject } from "@/lib/server/repo";

type P = Ctx<{ id: string }>;

export const GET = handle(async (_req: Request, { params }: P) => {
  const { id } = await params;
  const project = getProject(id);
  return project ? json({ ...project, assets: listAssets(id) }) : notFound("Project not found");
});

const patchBody = z.object({ name: z.string().max(100).optional(), doc: projectDoc.optional() });

export const PUT = handle(async (req: Request, { params }: P) => {
  const { id } = await params;
  const project = updateProject(id, patchBody.parse(await req.json()));
  return project ? json(project) : notFound("Project not found");
});

export const DELETE = handle(async (_req: Request, { params }: P) => {
  const { id } = await params;
  return deleteProject(id) ? json({ ok: true }) : notFound("Project not found");
});
