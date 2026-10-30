import { handle, json } from "@/lib/server/http";
import { listRenders } from "@/lib/server/repo";

export const GET = handle(() => json(listRenders()));
