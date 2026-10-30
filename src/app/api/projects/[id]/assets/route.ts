import { handle, json, notFound, type Ctx } from "@/lib/server/http";
import { getProject, listAssets } from "@/lib/server/repo";
import { storeUpload, UploadError } from "@/lib/server/uploads";

type P = Ctx<{ id: string }>;

export const GET = handle(async (_req: Request, { params }: P) => {
  const { id } = await params;
  if (!getProject(id)) return notFound("Project not found");
  return json(listAssets(id));
});

/** multipart/form-data with one or more `file` fields. */
export const POST = handle(async (req: Request, { params }: P) => {
  const { id } = await params;
  if (!getProject(id)) return notFound("Project not found");
  const form = await req.formData().catch(() => {
    throw new UploadError("Expected multipart/form-data");
  });
  const files = form.getAll("file").filter((f): f is File => f instanceof File);
  if (files.length === 0) throw new UploadError("No file provided");
  const stored = [];
  for (const file of files) {
    stored.push(await storeUpload(id, file.name, Buffer.from(await file.arrayBuffer())));
  }
  return json(stored, 201);
});
