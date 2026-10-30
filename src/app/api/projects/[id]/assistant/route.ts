import { z } from "zod";
import { runAssistant, type AssistantEvent } from "@/lib/server/claude";
import { handle, notFound, type Ctx } from "@/lib/server/http";
import { getProject } from "@/lib/server/repo";

const body = z.object({
  prompt: z.string().min(1).max(8000),
  sessionId: z.string().uuid().optional(),
});

/** Streams assistant events as newline-delimited JSON. */
export const POST = handle(async (req: Request, { params }: Ctx<{ id: string }>) => {
  const { id } = await params;
  const project = getProject(id);
  if (!project) return notFound("Project not found");
  const { prompt, sessionId } = body.parse(await req.json());
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (e: AssistantEvent) => {
        try {
          controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
        } catch {
          // Client went away.
        }
      };
      await runAssistant({ projectId: id, projectName: project.name, prompt, sessionId, emit, signal: req.signal });
      try {
        controller.close();
      } catch {
        // Already closed.
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-cache" } });
});

