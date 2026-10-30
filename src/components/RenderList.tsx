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
                  <a className="btn btn-primary !py-1 text-xs" href={`/api/renders/${job.id}/download`}>
                    Download MP4
                  </a>
                  <a className="btn !py-1 text-xs" href={`/api/renders/${job.id}/download?inline`} target="_blank" rel="noreferrer">
                    Watch
                  </a>
                </>
              ) : null}
              {job.status === "queued" || job.status === "rendering" ? (
                <button className="btn !py-1 text-xs" onClick={() => act(() => api.cancelRender(job.id))}>
                  Cancel
                </button>
              ) : (
                <button className="btn btn-ghost !py-1 text-xs text-ink-400" onClick={() => act(() => api.deleteRender(job.id))}>
                  Remove
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
