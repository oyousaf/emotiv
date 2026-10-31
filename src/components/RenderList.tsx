"use client";

import { useCallback, useEffect, useState } from "react";
import { FORMATS } from "@/lib/schema";
import type { RenderJob } from "@/lib/types";
import { api } from "./api";

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
    refresh();
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
            onClick={() => act(() => Promise.all(finished.map((j) => api.deleteRender(j.id))))}
          >
            🧹 Clear all
          </button>
          {withFiles.length ? (
            <button
              className="btn btn-ghost gap-1.5 py-1! text-xs text-bad"
              onClick={() => {
                if (confirm(deleteWarning(withFiles))) act(() => Promise.all(withFiles.map((j) => api.deleteRender(j.id, true))));
              }}
            >
              <TrashIcon /> Delete all
            </button>
          ) : null}
        </div>
      ) : null}
      <ul className="space-y-2">
        {jobs?.map((job) => (
          <li key={job.id} className="rounded-lg border border-ink-700 bg-ink-850 p-3">
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
                    onClick={() => act(() => api.deleteRender(job.id))}
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
                        if (confirm(deleteWarning([job]))) act(() => api.deleteRender(job.id, true));
                      }}
                    >
                      <TrashIcon />
                    </button>
                  ) : null}
                </>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
