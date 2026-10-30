import { z } from "zod";
import { RENDER_QUALITIES } from "@/lib/types";
import { handle, json, notFound, type Ctx } from "@/lib/server/http";
import { enqueueRender, getProject, listRenders } from "@/lib/server/repo";

type P = Ctx<{ id: string }>;

export const GET = handle(async (_req: Request, { params }: P) => {
  const { id } = await params;
  return json(listRenders(id));
});

const body = z.object({
  format: z.enum(["landscape", "vertical"]).optional(),
  quality: z.enum(RENDER_QUALITIES).default("standard"),
});

export const POST = handle(async (req: Request, { params }: P) => {
  const { id } = await params;
  const project = getProject(id);
  if (!project) return notFound("Project not found");
  const { format, quality } = body.parse(await req.json().catch(() => ({})));
  return json(enqueueRender(id, format ?? project.format, quality), 201);
});
