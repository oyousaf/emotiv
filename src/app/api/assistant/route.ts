import { findClaude } from "@/lib/server/claude";
import { handle, json } from "@/lib/server/http";

/** Whether the AI tab can run: is a Claude Code binary available? */
export const GET = handle(() => {
  const bin = findClaude();
  return json({ available: !!bin, binary: bin });
});
