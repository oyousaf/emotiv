import { handle, json, notFound, type Ctx } from "@/lib/server/http";
import { deleteRender, getRender } from "@/lib/server/repo";

type P = Ctx<{ id: string }>;

export const GET = handle(async (_req: Request, { params }: P) => {
  const job = getRender((await params).id);
  return job ? json(job) : notFound("Render not found");
});

export const DELETE = handle(async (_req: Request, { params }: P) => {
  const { id } = await params;
  if (!getRender(id)) return notFound("Render not found");
  return deleteRender(id) ? json({ ok: true }) : json({ error: "Cancel the render before deleting it" }, 409);
});
