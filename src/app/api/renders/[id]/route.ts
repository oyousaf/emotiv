import { handle, json, notFound, type Ctx } from "@/lib/server/http";
import { deleteRender, getRender } from "@/lib/server/repo";

type P = Ctx<{ id: string }>;

export const GET = handle(async (_req: Request, { params }: P) => {
  const job = getRender((await params).id);
  return job ? json(job) : notFound("Render not found");
});

/** Removes the job from the list; ?file also deletes its MP4 from the renders folder. */
export const DELETE = handle(async (req: Request, { params }: P) => {
  const { id } = await params;
  if (!getRender(id)) return notFound("Render not found");
  const deleteFile = new URL(req.url).searchParams.has("file");
  return deleteRender(id, { deleteFile }) ? json({ ok: true }) : json({ error: "Cancel the render before deleting it" }, 409);
});
