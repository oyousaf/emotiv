"use client";

import { useEffect, useState } from "react";
import { CAPTION_LIMITS, type Captions } from "@/lib/schema";
import { api } from "./api";

const FIELDS: { key: keyof Captions; label: string; rows: number }[] = [
  { key: "youtubeTitle", label: "YouTube title", rows: 1 },
  { key: "youtubeDescription", label: "YouTube description", rows: 6 },
  { key: "tiktok", label: "TikTok caption", rows: 4 },
  { key: "snapchat", label: "Snapchat caption", rows: 2 },
];

/**
 * The project's post text, one box per platform, each with a copy button.
 * Edits save when a box loses focus.
 */
export function CaptionsPanel({ projectId }: { projectId: string }) {
  const [captions, setCaptions] = useState<Captions | null>(null);
  const [copied, setCopied] = useState<keyof Captions | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getCaptions(projectId).then(setCaptions, (e: Error) => setError(e.message));
  }, [projectId]);

  const copy = async (key: keyof Captions) => {
    try {
      await navigator.clipboard.writeText(captions?.[key] ?? "");
      setCopied(key);
      setTimeout(() => setCopied((k) => (k === key ? null : k)), 1500);
    } catch {
      setError("Couldn't copy. Select the text and press Ctrl+C.");
    }
  };

  const save = (key: keyof Captions, value: string) =>
    api.saveCaptions(projectId, { [key]: value }).then(setCaptions, (e: Error) => setError(e.message));

  if (!captions) return error ? <p className="mt-2 text-xs text-bad">{error}</p> : null;

  return (
    <div className="mt-3 space-y-3 border-t border-ink-700 pt-3">
      {error ? <p className="text-xs text-bad">{error}</p> : null}
      {FIELDS.map(({ key, label, rows }) => {
        const value = captions[key];
        const limit = CAPTION_LIMITS[key];
        return (
          <div key={key}>
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">{label}</span>
              <span className="flex items-center gap-2">
                {limit ? (
                  <span className={`text-[11px] ${value.length > limit ? "text-bad" : "text-ink-500"}`}>
                    {value.length}/{limit}
                  </span>
                ) : null}
                <button className="btn py-0.5! text-xs" disabled={!value} onClick={() => copy(key)}>
                  {copied === key ? "✓ Copied" : "📋 Copy"}
                </button>
              </span>
            </div>
            <textarea
              className="w-full resize-y rounded-md border border-ink-700 bg-ink-900 px-2 py-1.5 text-xs leading-relaxed text-ink-100 focus:border-accent focus:outline-none"
              rows={rows}
              dir="auto"
              placeholder={`No ${label.toLowerCase()} yet. Type one, or ask the AI tab to write it.`}
              value={value}
              onChange={(e) => setCaptions({ ...captions, [key]: e.target.value })}
              onBlur={(e) => save(key, e.target.value)}
            />
          </div>
        );
      })}
    </div>
  );
}
