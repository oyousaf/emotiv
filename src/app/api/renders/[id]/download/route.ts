import { fileResponse } from "@/lib/server/files";
import { handle, json, notFound, type Ctx } from "@/lib/server/http";
import { renderPath } from "@/lib/server/paths";
import { getRender } from "@/lib/server/repo";

/** ?inline streams for an in-page <video>; otherwise it downloads. */
export const GET = handle(async (req: Request, { params }: Ctx<{ id: string }>) => {
  const job = getRender((await params).id);
  if (!job) return notFound("Render not found");
  if (job.status !== "done" || !job.outputFile) return json({ error: "Render is not finished" }, 409);
  const slug = job.projectName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "render";
  const stamp = new Date(job.finishedAt ?? Date.now()).toISOString().slice(0, 10);
  const inline = new URL(req.url).searchParams.has("inline");
  return fileResponse(renderPath(job.outputFile), {
    mime: "video/mp4",
    range: req.headers.get("range"),
    headers: {
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${slug}-${job.format}-${stamp}.mp4"`,
    },
  });
});
