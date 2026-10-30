import fs from "node:fs";
import path from "node:path";
import { getDataDir } from "./paths";

/** The worker touches this file while it's alive so the UI can tell if it's running. */
const file = () => path.join(getDataDir(), "worker-heartbeat.json");
const STALE_MS = 10_000;

export function writeHeartbeat(state: string) {
  fs.writeFileSync(file(), JSON.stringify({ pid: process.pid, state, at: Date.now() }));
}

export function readHeartbeat(): { online: boolean; lastSeen: number | null; state: string | null } {
  try {
    const { at, state } = JSON.parse(fs.readFileSync(file(), "utf8")) as { at: number; state: string };
    return { online: Date.now() - at < STALE_MS && state !== "stopped", lastSeen: at, state };
  } catch {
    return { online: false, lastSeen: null, state: null };
  }
}
