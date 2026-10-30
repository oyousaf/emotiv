import { z } from "zod";
import { BUILTIN_TEMPLATES } from "@/lib/templates";
import { scene } from "@/lib/schema";
import { handle, json } from "@/lib/server/http";
import { listCustomTemplates, saveCustomTemplate } from "@/lib/server/repo";

export const GET = handle(() =>
  json({
    builtin: BUILTIN_TEMPLATES.map(({ id, name, category, description }) => ({ id, name, category, description })),
    custom: listCustomTemplates(),
  }),
);

const body = z.object({ name: z.string().min(1).max(100), description: z.string().max(200).default(""), scene });

export const POST = handle(async (req: Request) => {
  const b = body.parse(await req.json());
  return json(saveCustomTemplate(b.name, b.scene, b.description), 201);
});
