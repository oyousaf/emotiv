import { captions } from "@/lib/schema";
import { handle, json, notFound, type Ctx } from "@/lib/server/http";
import { getCaptions, getProject, updateCaptions } from "@/lib/server/repo";

type P = Ctx<{ id: string }>;

export const GET = handle(async (_req: Request, { params }: P) => {
  const { id } = await params;
  return getProject(id) ? json(getCaptions(id)) : notFound("Project not found");
});

/** Merges the posted fields into the project's captions. */
export const PUT = handle(async (req: Request, { params }: P) => {
  const { id } = await params;
  const next = updateCaptions(id, captions.partial().parse(await req.json()));
  return next ? json(next) : notFound("Project not found");
});
