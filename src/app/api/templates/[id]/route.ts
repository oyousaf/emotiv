import { handle, json, notFound, type Ctx } from "@/lib/server/http";
import { deleteCustomTemplate } from "@/lib/server/repo";

export const DELETE = handle(async (_req: Request, { params }: Ctx<{ id: string }>) =>
  deleteCustomTemplate((await params).id) ? json({ ok: true }) : notFound("Template not found"),
);
