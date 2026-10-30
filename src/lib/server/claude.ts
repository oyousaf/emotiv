import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getDataDir } from "./paths";

/**
 * The AI tab runs the user's own Claude Code (already signed in) in headless
 * mode, with only the emotiv MCP tools available: no shell, no file edits.
 */

export function findClaude(): string | null {
  const fromEnv = process.env.CLAUDE_CODE_PATH;
  if (fromEnv && fs.existsSync(fromEnv)) return fromEnv;
  const exe = process.platform === "win32" ? ["claude.exe", "claude.cmd"] : ["claude"];
  for (const dir of (process.env.PATH ?? "").split(path.delimiter)) {
    for (const name of exe) {
      const p = path.join(dir, name);
      if (dir && fs.existsSync(p)) return p;
    }
  }
  // The VS Code / Cursor extensions ship a native binary.
  const home = os.homedir();
  for (const root of [".vscode", ".cursor", ".vscode-insiders", ".windsurf"].map((d) => path.join(home, d, "extensions"))) {
    if (!fs.existsSync(root)) continue;
    const dirs = fs
      .readdirSync(root)
      .filter((d) => d.startsWith("anthropic.claude-code-"))
      .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
    for (const d of dirs) {
      const p = path.join(root, d, "resources", "native-binary", process.platform === "win32" ? "claude.exe" : "claude");
      if (fs.existsSync(p)) return p;
    }
  }
  return null;
}

export type AssistantEvent =
  | { kind: "session"; sessionId: string }
  | { kind: "text"; text: string }
  | { kind: "tool"; name: string; input: unknown }
  | { kind: "tool_result"; isError: boolean }
  | { kind: "done"; ok: boolean; result: string; costUsd?: number; turns?: number }
  | { kind: "error"; message: string };

function systemPrompt(projectId: string, projectName: string) {
  return `You are the AI assistant inside emotiv AI, a local motion graphics editor. The user is editing project "${projectName}" (projectId: ${projectId}) and is watching the preview while you work.

- Use the emotiv MCP tools to inspect and change the project. Call get_project first to see the current document, scene timings and assets.
- Make the change directly instead of asking for permission. Ask only if the request is genuinely ambiguous.
- Prefer targeted edits (update_element, update_scene, add_element, add_scene) over save_project.
- When layout, fit or readability matters, check with preview_frame and fix what you see.
- Reply in one to three short sentences in British English saying what you changed. No markdown headings.
- You have no access to the shell or files beyond these tools. To bring in a file, use import_asset with the absolute path the user gives you.`;
}

/**
 * Run one assistant turn. Continues the conversation when `sessionId` is
 * given. Calls `emit` for every event and resolves when Claude Code exits.
 */
export function runAssistant(opts: {
  projectId: string;
  projectName: string;
  prompt: string;
  sessionId?: string;
  emit: (e: AssistantEvent) => void;
  signal?: AbortSignal;
}): Promise<void> {
  const bin = findClaude();
  if (!bin) {
    opts.emit({ kind: "error", message: "Claude Code wasn't found. Install it (npm i -g @anthropic-ai/claude-code) and sign in, or set CLAUDE_CODE_PATH." });
    return Promise.resolve();
  }

  const appRoot = process.cwd();
  const work = path.join(getDataDir(), "assistant");
  fs.mkdirSync(work, { recursive: true });
  const mcpConfig = path.join(work, "mcp.json");
  fs.writeFileSync(
    mcpConfig,
    JSON.stringify({
      mcpServers: {
        emotiv: {
          command: process.execPath,
          args: [path.join(appRoot, "node_modules", "tsx", "dist", "cli.mjs"), path.join(appRoot, "mcp", "server.ts")],
          env: { STUDIO_DATA_DIR: getDataDir() },
        },
      },
    }),
  );
  const promptFile = path.join(work, `system-${opts.projectId}.txt`);
  fs.writeFileSync(promptFile, systemPrompt(opts.projectId, opts.projectName));

  const args = [
    "-p",
    "--output-format", "stream-json",
    "--verbose",
    "--tools", "",
    "--strict-mcp-config",
    "--mcp-config", mcpConfig,
    "--allowedTools", "mcp__emotiv",
    "--permission-mode", "dontAsk",
    "--append-system-prompt-file", promptFile,
    "--max-turns", "40",
    ...(opts.sessionId ? ["--resume", opts.sessionId] : []),
  ];

  return new Promise((resolve) => {
    let child: ChildProcess;
    try {
      // npm installs a .cmd shim on Windows, which needs a shell to run.
      child = bin.endsWith(".cmd")
        ? spawn(process.env.ComSpec ?? "cmd.exe", ["/d", "/s", "/c", bin, ...args.map((a) => (a === "" ? '""' : a))], { cwd: work, windowsHide: true })
        : spawn(bin, args, { cwd: work, windowsHide: true });
    } catch (err) {
      opts.emit({ kind: "error", message: (err as Error).message });
      return resolve();
    }
    const kill = () => child.kill();
    opts.signal?.addEventListener("abort", kill);

    let buffer = "";
    let stderr = "";
    let finished = false;
    child.stdout!.on("data", (chunk) => {
      buffer += chunk;
      let nl;
      while ((nl = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!line) continue;
        try {
          for (const e of translate(JSON.parse(line))) {
            if (e.kind === "done") finished = true;
            opts.emit(e);
          }
        } catch {
          // Non-JSON noise; ignore.
        }
      }
    });
    child.stderr!.on("data", (d) => (stderr = (stderr + d).slice(-4000)));
    child.on("error", (err) => opts.emit({ kind: "error", message: err.message }));
    child.on("close", (code) => {
      opts.signal?.removeEventListener("abort", kill);
      if (!finished) {
        opts.emit(
          opts.signal?.aborted
            ? { kind: "done", ok: false, result: "Stopped." }
            : { kind: "error", message: stderr.trim().split("\n").slice(-3).join(" ") || `Claude Code exited with code ${code}. Is it signed in? Run \`claude\` once in a terminal.` },
        );
      }
      resolve();
    });
    child.stdin!.end(opts.prompt);
  });
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export function translate(msg: any): AssistantEvent[] {
  if (msg.type === "system" && msg.subtype === "init" && msg.session_id) return [{ kind: "session", sessionId: msg.session_id }];
  if (msg.type === "assistant") {
    return (msg.message?.content ?? []).flatMap((c: any): AssistantEvent[] => {
      if (c.type === "text" && c.text?.trim()) return [{ kind: "text", text: c.text }];
      if (c.type === "tool_use") return [{ kind: "tool", name: String(c.name).replace(/^mcp__emotiv__/, ""), input: c.input }];
      return [];
    });
  }
  if (msg.type === "user") {
    return (msg.message?.content ?? [])
      .filter((c: any) => c.type === "tool_result")
      .map((c: any): AssistantEvent => ({ kind: "tool_result", isError: !!c.is_error }));
  }
  if (msg.type === "result") {
    return [{ kind: "done", ok: !msg.is_error, result: String(msg.result ?? ""), costUsd: msg.total_cost_usd, turns: msg.num_turns }];
  }
  return [];
}
