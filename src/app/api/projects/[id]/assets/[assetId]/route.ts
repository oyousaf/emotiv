import { assetUsage } from "@/lib/doc-ops";
import { handle, json, notFound, type Ctx } from "@/lib/server/http";
import { deleteAsset, getProject } from "@/lib/server/repo";
import { removeAssetFile } from "@/lib/server/uploads";

export const DELETE = handle(async (_req: Request, { params }: Ctx<{ id: string; assetId: string }>) => {
  const { id, assetId } = await params;
  const project = getProject(id);
  if (!project) return notFound("Project not found");
  const usage = assetUsage(project.doc, assetId);
  if (usage.length) {
    return json({ error: `Asset is used in: ${usage.join(", ")}. Remove it there first.` }, 409);
  }
  const asset = deleteAsset(id, assetId);
  if (!asset) return notFound("Asset not found");
  removeAssetFile(asset);
  return json({ ok: true });
});
