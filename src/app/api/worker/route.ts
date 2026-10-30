import { readHeartbeat } from "@/lib/server/heartbeat";
import { handle, json } from "@/lib/server/http";

export const GET = handle(() => json(readHeartbeat()));
