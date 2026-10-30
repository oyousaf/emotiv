import { fileResponse } from "@/lib/server/files";
import { handle, notFound, type Ctx } from "@/lib/server/http";
import { assetPath, isSafeFileName, isSafeId } from "@/lib/server/paths";
import { getAssetByFile } from "@/lib/server/repo";

/** Serves a project asset to the editor preview, with Range support. */
export const GET = handle(async (req: Request, { params }: Ctx<{ id: string; file: string }>) => {
  const { id, file } = await params;
  if (!isSafeId(id) || !isSafeFileName(file)) return notFound();
  // Only files the database knows about for this project are served.
  const asset = getAssetByFile(id, file);
  if (!asset) return notFound();
  return fileResponse(assetPath(id, asset.fileName), {
    mime: asset.mime,
    range: req.headers.get("range"),
    headers: { "Content-Security-Policy": "default-src 'none'; sandbox" },
  });
});
