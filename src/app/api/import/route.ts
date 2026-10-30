import { z } from "zod";
import { handle, json } from "@/lib/server/http";
import { importProject, type ImportFile } from "@/lib/server/import";
import { UploadError } from "@/lib/server/uploads";

const n = z.number().finite().nullable().default(null);
const options = z.object({
  name: z.string().max(100).optional(),
  format: z.enum(["landscape", "vertical"]).optional(),
  mode: z.enum(["hybrid", "exact"]).default("hybrid"),
  compId: z.string().max(200).optional(),
  aep: z
    .object({
      file: z.string().max(200),
      name: z.string().max(200),
      width: n,
      height: n,
      fps: n,
      durationSeconds: n,
      backgroundColor: z.string().max(9).nullable().default(null),
      layers: z.array(z.object({ name: z.string().max(200), type: z.string().max(20) })).max(500).default([]),
      texts: z.array(z.string().max(500)).max(20).default([]),
    })
    .optional(),
  cuts: z.array(z.number().min(0).max(86_400)).max(2000).default([]),
  keepFootage: z.boolean().default(false),
});

const toFile = async (f: FormDataEntryValue | null): Promise<ImportFile | undefined> =>
  f instanceof File ? { name: f.name, buf: Buffer.from(await f.arrayBuffer()) } : undefined;

/**
 * multipart/form-data: `video` (MP4), `lottie` (Bodymovin JSON), any number
 * of `extra` files (fonts, footage, images) and `options` (JSON, including
 * the chosen comp). .aep files are read in the browser; only the chosen
 * comp's metadata is sent.
 */
export const POST = handle(async (req: Request) => {
  const form = await req.formData().catch(() => {
    throw new UploadError("Expected multipart/form-data");
  });
  const opts = options.parse(JSON.parse(String(form.get("options") ?? "{}")));
  const extras = await Promise.all(form.getAll("extra").map(toFile));
  const { project, report } = await importProject(
    {
      video: await toFile(form.get("video")),
      lottie: await toFile(form.get("lottie")),
      extras: extras.filter((f): f is ImportFile => !!f),
    },
    opts,
  );
  return json({ project: { id: project.id, name: project.name }, report }, 201);
});
