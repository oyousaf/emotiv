"use client";

import { useEffect, useRef, useState } from "react";
import type { AssistantEvent } from "@/lib/server/claude";
import { useEditor } from "./context";

type Message = { role: "user" | "assistant"; text: string; tools: string[]; error?: boolean };

const SUGGESTIONS = [
  "Make the headline punchier and add a glow",
  "Tighten the timing so the whole video is about 10 seconds",
  "Adapt this for a 9:16 Reel and check every scene fits",
  "Restyle it in a warm autumn palette",
];

const TOOL_LABELS: Record<string, string> = {
  get_project: "Read project",
  get_guide: "Read guide",
  update_element: "Edited layer",
  update_scene: "Edited scene",
  add_element: "Added layer",
  add_scene: "Added scene",
  remove: "Removed",
  move_scene: "Moved scene",
  save_project: "Saved project",
  preview_frame: "Checked a frame",
  import_asset: "Imported asset",
  render_video: "Queued render",
  render_status: "Checked render",
  list_templates: "Read templates",
  list_projects: "Listed projects",
  create_project: "Created project",
};

const storageKey = (id: string) => `emotiv:assistant:${id}`;

/**
 * The AI tab: a prompt box backed by the user's own Claude Code login, which
 * edits the project through the emotiv MCP tools. Edits land in the database
 * and the editor pulls them in (and they're undoable).
 */
export function AssistantPanel() {
  const { projectId, saveNow, refreshFromServer, doc } = useEditor();
  const suggestions = doc.source?.layers.length
    ? [`Rebuild the original “${doc.source.comp ?? doc.source.file}” comp from its layer list as closely as you can`, ...SUGGESTIONS.slice(0, 3)]
    : SUGGESTIONS;
  const [available, setAvailable] = useState<boolean | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [sessionId, setSessionId] = useState<string | undefined>();
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const log = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/assistant")
      .then((r) => r.json())
      .then((r) => setAvailable(!!r.available))
      .catch(() => setAvailable(false));
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey(projectId)) ?? "null");
      if (saved) {
        setMessages(saved.messages ?? []);
        setSessionId(saved.sessionId);
      }
    } catch {
      // Ignore unreadable storage.
    }
  }, [projectId]);

  useEffect(() => {
    try {
      localStorage.setItem(storageKey(projectId), JSON.stringify({ sessionId, messages: messages.slice(-40) }));
    } catch {
      // Storage full or blocked: the chat still works for this visit.
    }
    log.current?.scrollTo({ top: log.current.scrollHeight, behavior: "smooth" });
  }, [messages, sessionId, projectId]);

  const update = (fn: (m: Message) => Message) =>
    setMessages((list) => [...list.slice(0, -1), fn(list[list.length - 1])]);

  const send = async (text: string) => {
    const p = text.trim();
    if (!p || busy) return;
    setPrompt("");
    setBusy(true);
    setMessages((list) => [...list, { role: "user", text: p, tools: [] }, { role: "assistant", text: "", tools: [] }]);
    const controller = new AbortController();
    abort.current = controller;
    try {
      // The assistant reads the saved project, so save what's on screen first.
      await saveNow();
      const res = await fetch(`/api/projects/${projectId}/assistant`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: p, sessionId }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) throw new Error((await res.json().catch(() => ({}))).error ?? `Request failed (${res.status})`);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let nl;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl);
          buf = buf.slice(nl + 1);
          if (!line.trim()) continue;
          const e = JSON.parse(line) as AssistantEvent;
          if (e.kind === "session") setSessionId(e.sessionId);
          else if (e.kind === "text") update((m) => ({ ...m, text: m.text ? `${m.text}\n\n${e.text}` : e.text }));
          else if (e.kind === "tool") update((m) => ({ ...m, tools: [...m.tools, TOOL_LABELS[e.name] ?? e.name] }));
          else if (e.kind === "tool_result") refreshFromServer();
          else if (e.kind === "done") update((m) => ({ ...m, text: m.text || e.result, error: !e.ok }));
          else if (e.kind === "error") update((m) => ({ ...m, text: e.message, error: true }));
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") update((m) => ({ ...m, text: (err as Error).message, error: true }));
      else update((m) => ({ ...m, text: m.text || "Stopped." }));
    } finally {
      setBusy(false);
      abort.current = null;
      refreshFromServer();
    }
  };

  if (available === false) {
    return (
      <div className="space-y-2 p-3 text-sm text-ink-300">
        <h3 className="panel-title">AI assistant</h3>
        <p>
          The assistant runs your own <strong>Claude Code</strong>, so there&apos;s no API key to manage. Claude Code wasn&apos;t
          found on this machine.
        </p>
        <ol className="list-inside list-decimal space-y-1 text-xs text-ink-400">
          <li>
            Install it: <code className="font-mono">npm i -g @anthropic-ai/claude-code</code>
          </li>
          <li>
            Run <code className="font-mono">claude</code> once in a terminal and sign in.
          </li>
          <li>Restart emotiv.</li>
        </ol>
        <p className="text-xs text-ink-500">
          Or set <code className="font-mono">CLAUDE_CODE_PATH</code> to the Claude Code executable.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-ink-800 px-3 py-2">
        <h3 className="panel-title">AI assistant</h3>
        <button
          className="text-[11px] text-ink-500 hover:text-ink-200 disabled:opacity-40"
          disabled={busy || messages.length === 0}
          onClick={() => {
            setMessages([]);
            setSessionId(undefined);
          }}
        >
          New chat
        </button>
      </div>

      <div ref={log} className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        {messages.length === 0 ? (
          <div className="space-y-2">
            <p className="text-xs leading-relaxed text-ink-400">
              Describe a change and Claude makes it in this project. You&apos;ll see each edit in the preview, and Ctrl+Z undoes it.
            </p>
            {suggestions.map((s) => (
              <button
                key={s}
                className="block w-full rounded-md border border-ink-700 px-2 py-1.5 text-left text-xs text-ink-300 hover:border-ink-500 hover:text-white"
                onClick={() => send(s)}
              >
                {s}
              </button>
            ))}
          </div>
        ) : null}
        {messages.map((m, i) =>
          m.role === "user" ? (
            <div key={i} className="ml-6 rounded-lg bg-accent-soft px-2.5 py-2 text-sm text-ink-100">
              {m.text}
            </div>
          ) : (
            <div key={i} className="space-y-1.5">
              {m.tools.length ? (
                <div className="flex flex-wrap gap-1">
                  {m.tools.map((t, j) => (
                    <span key={j} className="rounded border border-ink-700 px-1.5 py-0.5 text-[10px] text-ink-400">
                      {t}
                    </span>
                  ))}
                </div>
              ) : null}
              {m.text ? (
                <p className={`whitespace-pre-wrap text-sm leading-relaxed ${m.error ? "text-bad" : "text-ink-200"}`}>{m.text}</p>
              ) : busy && i === messages.length - 1 ? (
                <p className="animate-pulse text-xs text-ink-500">Working…</p>
              ) : null}
            </div>
          ),
        )}
      </div>

      <form
        className="border-t border-ink-800 p-2"
        onSubmit={(e) => {
          e.preventDefault();
          send(prompt);
        }}
      >
        <textarea
          className="field min-h-16 resize-none text-sm"
          placeholder={available === null ? "Checking for Claude Code…" : "e.g. Make the stat count to 50K and turn it gold"}
          value={prompt}
          disabled={available !== true}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(prompt);
            }
          }}
        />
        <div className="mt-1.5 flex items-center justify-between">
          <span className="text-[10px] text-ink-600">Enter to send · Shift+Enter for a new line</span>
          {busy ? (
            <button type="button" className="btn py-1! text-xs" onClick={() => abort.current?.abort()}>
              Stop
            </button>
          ) : (
            <button className="btn btn-primary py-1! text-xs" disabled={!prompt.trim() || available !== true}>
              Send
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
