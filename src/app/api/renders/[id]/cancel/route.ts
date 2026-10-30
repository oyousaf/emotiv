import { handle, json, notFound, type Ctx } from "@/lib/server/http";
import { cancelRender } from "@/lib/server/repo";

export const POST = handle(async (_req: Request, { params }: Ctx<{ id: string }>) => {
  const job = cancelRender((await params).id);
  return job ? json(job) : notFound("Render not found");
});
