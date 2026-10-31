"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { FORMATS } from "@/lib/schema";
import type { RenderJob } from "@/lib/types";
import { api } from "./api";
import { CaptionsPanel } from "./CaptionsPanel";

const STATUS_STYLE: Record<RenderJob["status"], string> = {
  queued: "text-ink-300",
  rendering: "text-cyan",
  done: "text-ok",
  failed: "text-bad",
  cancelled: "text-ink-500",
};

function elapsed(job: RenderJob) {
  if (!job.startedAt) return null;
  const s = ((job.finishedAt ?? Date.now()) - job.startedAt) / 1000;
  return s < 60 ? `${s.toFixed(0)}s` : `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`;
}

/** Drawn in currentColor so it can be red; the 🗑️ emoji can't be recoloured. */
function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6" />
    </svg>
  );
}

const STAGGER_S = 0.07;
const EXIT_S = 0.35;
type Leaving = { index: number; mode: "clear" | "delete" };

/** Cleared jobs sweep off to the left; deleted ones flash red and drop away to the right. */
function leaveVariant(info: Leaving | undefined) {
  const transition = { duration: EXIT_S, delay: (info?.index ?? 0) * STAGGER_S, ease: [0.4, 0, 1, 1] as const };
  return info?.mode === "delete"
    ? { opacity: 0, x: 48, scale: 0.92, borderColor: "#ff4d6d", filter: "blur(2px)", transition }
    : { opacity: 0, x: -64, filter: "blur(3px)", transition };
}

function clearWarning(count: number) {
  return `This will clear ${count} finished job${count === 1 ? "" : "s"} from the render queue. The MP4s stay in data/renders.

Clear?`;
}

function deleteWarning(jobs: RenderJob[]) {
  const what = jobs.length === 1 ? jobs[0].outputFile : `${jobs.length} videos`;
  return `This will permanently delete ${what} from your device (data/renders). It can't be undone.\n\nDelete?`;
}

/**
 * Live view of the render queue. Polls quickly while anything is queued or
 * rendering, slowly otherwise. `refreshKey` forces an immediate refresh.
 */
export function RenderList({ projectId, refreshKey = 0, compact = false }: { projectId?: string; refreshKey?: number; compact?: boolean }) {
  const [jobs, setJobs] = useState<RenderJob[] | null>(null);
  const [worker, setWorker] = useState<{ online: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openCaptions, setOpenCaptions] = useState<string | null>(null);
  // Jobs on their way out: hidden so they animate away, then removed on the server.
  const [leaving, setLeaving] = useState<Map<string, Leaving>>(new Map());
  const leavingRef = useRef(leaving); // read by exit animations after the job has left the tree
  const reduceMotion = useReducedMotion();

  const refresh = useCallback(async () => {
    try {
      const [list, w] = await Promise.all([api.listRenders(projectId), api.workerStatus()]);
      setJobs(list);
      setWorker(w);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [projectId]);

  const active = jobs?.some((j) => j.status === "queued" || j.status === "rendering") ?? false;
  // Bulk actions only touch jobs that have stopped; running renders are left alone.
  const finished = jobs?.filter((j) => j.status !== "queued" && j.status !== "rendering") ?? [];
  const withFiles = finished.filter((j) => j.outputFile);

  useEffect(() => {
    refresh();
  }, [refresh, refreshKey]);

  useEffect(() => {
    const t = setInterval(refresh, active ? 1000 : 5000);
    return () => clearInterval(t);
  }, [refresh, active]);

  const act = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    }
    await refresh();
  };

  /** Animates the jobs out one after another, then clears (or deletes) them. */
  const remove = async (targets: RenderJob[], mode: Leaving["mode"]) => {
    const next = new Map(targets.map((j, index) => [j.id, { index, mode }] as const));
    leavingRef.current = next;
    setLeaving(next);
    if (!reduceMotion) await new Promise((r) => setTimeout(r, (STAGGER_S * targets.length + EXIT_S) * 1000));
    await act(() => Promise.all(targets.map((j) => api.deleteRender(j.id, mode === "delete"))));
    setLeaving(new Map());
  };

  return (
    <div className="space-y-2">
      {worker && !worker.online ? (
        <div className="rounded-md border border-warn/40 bg-warn/10 px-3 py-2 text-xs text-warn">
          Render worker is offline. Jobs will wait in the queue. Start it with{" "}
          <code className="font-mono">npm run worker</code> (or use <code className="font-mono">npm run dev</code>).
        </div>
      ) : null}
      {error ? <div className="text-xs text-bad">{error}</div> : null}
      {jobs && jobs.length === 0 ? <p className="text-sm text-ink-500">No renders yet.</p> : null}
      {finished.length > 1 ? (
        <div className="flex justify-between gap-2">
          <button
            className="btn btn-ghost py-1! text-xs text-ink-300"
            title="Clear finished jobs from this list. The MP4s stay in data/renders."
            onClick={() => {
              if (confirm(clearWarning(finished.length))) remove(finished, "clear");
            }}
          >
            🧹 Clear all
          </button>
          {withFiles.length ? (
            <button
              className="btn btn-ghost gap-1.5 py-1! text-xs text-bad"
              onClick={() => {
                if (confirm(deleteWarning(withFiles))) remove(withFiles, "delete");
              }}
            >
              <TrashIcon /> Delete all
            </button>
          ) : null}
        </div>
      ) : null}
      <ul className="space-y-2">
        <AnimatePresence initial={false}>
          {jobs?.filter((job) => !leaving.has(job.id)).map((job) => (
          <motion.li
            key={job.id}
            layout={!reduceMotion}
            custom={job.id}
            exit={reduceMotion ? { opacity: 0 } : "leave"}
            variants={{ leave: (id: string) => leaveVariant(leavingRef.current.get(id)) }}
            className="rounded-lg border border-ink-700 bg-ink-850 p-3"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                {!compact ? <div className="truncate text-sm font-medium">{job.projectName}</div> : null}
                <div className="text-xs text-ink-400">
                  {FORMATS[job.format].label} · {job.quality} · {new Date(job.createdAt).toLocaleTimeString("en-GB", { timeStyle: "short" })}
                  {elapsed(job) ? ` · ${elapsed(job)}` : ""}
                </div>
              </div>
              <span className={`shrink-0 text-xs font-semibold uppercase tracking-wider ${STATUS_STYLE[job.status]}`}>
                {job.status === "rendering" ? `${Math.round(job.progress * 100)}%` : job.status}
              </span>
            </div>
            {job.status === "rendering" || job.status === "queued" ? (
              <div className="mt-2 h-1 overflow-hidden rounded-full bg-ink-700">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-accent to-cyan transition-[width] duration-500"
                  style={{ width: `${Math.max(2, job.progress * 100)}%` }}
                />
              </div>
            ) : null}
            {job.status === "failed" && job.error ? (
              <p className="mt-2 line-clamp-3 font-mono text-[11px] text-bad/90" title={job.error}>
                {job.error}
              </p>
            ) : null}
            <div className="mt-2 flex flex-wrap gap-1.5">
              {job.status === "done" ? (
                <>
                  <a className="btn btn-primary py-1! text-xs" href={`/api/renders/${job.id}/download`}>
                    Download MP4
                  </a>
                  <a className="btn py-1! text-xs" href={`/api/renders/${job.id}/download?inline`} target="_blank" rel="noreferrer">
                    Watch
                  </a>
                  <button
                    className={`btn py-1! text-xs ${openCaptions === job.id ? "border-accent!" : ""}`}
                    aria-expanded={openCaptions === job.id}
                    onClick={() => setOpenCaptions((id) => (id === job.id ? null : job.id))}
                  >
                    📋 Captions
                  </button>
                </>
              ) : null}
              {job.status === "queued" || job.status === "rendering" ? (
                <button className="btn py-1! text-xs" onClick={() => act(() => api.cancelRender(job.id))}>
                  Cancel
                </button>
              ) : (
                <>
                  <button
                    className="btn btn-ghost py-1! text-sm"
                    title={job.outputFile ? `Clear from this list. ${job.outputFile} stays in data/renders.` : "Clear from this list."}
                    aria-label="Clear from list"
                    onClick={() => remove([job], "clear")}
                  >
                    🧹
                  </button>
                  {/* Pushed to the far right, away from Download, so it isn't clicked by accident. */}
                  {job.outputFile ? (
                    <button
                      className="btn btn-ghost ml-auto py-1! text-sm text-bad"
                      title={`Permanently delete ${job.outputFile}`}
                      aria-label="Delete file"
                      onClick={() => {
                        if (confirm(deleteWarning([job]))) remove([job], "delete");
                      }}
                    >
                      <TrashIcon />
                    </button>
                  ) : null}
                </>
              )}
            </div>
            {openCaptions === job.id ? <CaptionsPanel projectId={job.projectId} /> : null}
          </motion.li>
          ))}
        </AnimatePresence>
      </ul>
    </div>
  );
}
