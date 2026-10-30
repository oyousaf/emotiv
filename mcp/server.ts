/**
 * emotiv MCP server (stdio). Lets Claude Code read and edit emotiv projects:
 *   - automatically, from the editor's AI tab (the app starts Claude Code with it)
 *   - from Claude Code in VS Code or a terminal opened in this folder (.mcp.json)
 */
import path from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { GUIDE, TOOLS } from "./tools";

// Paths (data folder, composition sources) are relative to the app root.
process.chdir(path.resolve(import.meta.dirname, ".."));

const server = new McpServer(
  { name: "emotiv", version: "0.1.0" },
  { instructions: `Tools for editing emotiv AI motion graphics projects stored on this machine.\n\n${GUIDE}` },
);

for (const t of TOOLS) {
  server.registerTool(t.name, { description: t.description, inputSchema: t.input }, async (args: unknown) => {
    const r = await (t.handler as (a: unknown) => Promise<{ text: string; image?: { data: string; mimeType: string }; isError?: boolean }>)(args ?? {});
    const content: ({ type: "text"; text: string } | { type: "image"; data: string; mimeType: string })[] = [{ type: "text", text: r.text }];
    if (r.image) content.push({ type: "image", data: r.image.data, mimeType: r.image.mimeType });
    return { content, isError: r.isError };
  });
}

// stdout carries the protocol; keep logs on stderr.
console.log = (...a: unknown[]) => console.error(...a);
await server.connect(new StdioServerTransport());
