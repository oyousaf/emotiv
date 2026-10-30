import { ZodError } from "zod";
import { PathError } from "./paths";
import { UploadError } from "./uploads";

export const json = (data: unknown, status = 200) => Response.json(data, { status });
export const notFound = (what = "Not found") => json({ error: what }, 404);

/** Map known error types to HTTP responses; anything else is a 500. */
export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response> | Response) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (err) {
      if (err instanceof ZodError) {
        return json({ error: "Invalid data", issues: err.issues.slice(0, 10) }, 400);
      }
      if (err instanceof PathError) return json({ error: err.message }, 400);
      if (err instanceof UploadError) return json({ error: err.message }, err.status);
      if (err instanceof SyntaxError) return json({ error: "Malformed JSON" }, 400);
      console.error(err);
      return json({ error: "Internal error" }, 500);
    }
  };
}

export type Ctx<P extends Record<string, string>> = { params: Promise<P> };
