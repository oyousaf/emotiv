"use client";

import { Thumbnail } from "@remotion/player";
import { motion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Main } from "@/remotion/Main";
import { FORMATS, type CompositionProps, type FormatId } from "@/lib/schema";
import { framesToTimecode, getTotalDuration } from "@/lib/timeline";
import type { ProjectSummary } from "@/lib/types";
import { api } from "./api";
import { ImportPanel } from "./import/ImportPanel";
import { RenderList } from "./RenderList";
import { SeasonalEmoji, ThemePicker } from "./SeasonalTheme";
import { APP_HEADLINE, APP_NAME, APP_TAGLINE } from "@/lib/brand";

export type DashboardProject = ProjectSummary & { props: CompositionProps };
type TemplateOption = { id: string; name: string; description: string; custom: boolean };

function ProjectCard({ project, onDelete }: { project: DashboardProject; onDelete: () => void }) {
  const { width, height } = FORMATS[project.format];
  const duration = getTotalDuration(project.props.doc);
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="group overflow-hidden rounded-xl border border-ink-700 bg-ink-900 transition-colors hover:border-ink-500"
    >
      <Link href={`/projects/${project.id}`} className="block">
        <div className="flex aspect-video items-center justify-center overflow-hidden bg-black">
          <Thumbnail
            component={Main}
            inputProps={project.props}
            compositionWidth={width}
            compositionHeight={height}
            durationInFrames={duration}
            fps={project.props.doc.fps}
            frameToDisplay={Math.min(duration - 1, 60)}
            style={project.format === "vertical" ? { height: "100%" } : { width: "100%" }}
          />
        </div>
      </Link>
      <div className="flex items-start justify-between gap-2 p-3">
        <Link href={`/projects/${project.id}`} className="min-w-0">
          <div className="truncate font-medium">{project.name}</div>
          <div className="mt-0.5 text-xs text-ink-400">
            {FORMATS[project.format].label} · {project.sceneCount} scenes · {framesToTimecode(project.durationInFrames, 30)}
          </div>
          <div className="text-[11px] text-ink-500">Edited {new Date(project.updatedAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</div>
        </Link>
        <button
          className="btn btn-ghost btn-icon text-xs text-ink-500 opacity-0 transition-opacity group-hover:opacity-100 hover:text-bad"
          title="Delete project"
          onClick={onDelete}
        >
          Delete
        </button>
      </div>
    </motion.div>
  );
}

export function Dashboard({ projects, templates }: { projects: DashboardProject[]; templates: TemplateOption[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [format, setFormat] = useState<FormatId>("landscape");
  const [templateId, setTemplateId] = useState("kinetic-title");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const p = await api.createProject(name || "Untitled project", format, templateId);
      router.push(`/projects/${p.id}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  const remove = async (p: DashboardProject) => {
    if (!confirm(`Delete "${p.name}" and all of its assets and renders? This can't be undone.`)) return;
    try {
      await api.deleteProject(p.id);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-8">
      <header className="mb-10 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-3 text-3xl font-semibold tracking-tight">
            <span>
              {APP_NAME.replace(/ AI$/, "")}
              {APP_NAME.endsWith(" AI") ? <span className="ml-1.5 text-accent">AI</span> : null}
            </span>
            <SeasonalEmoji />
          </h1>
          <p className="mt-2 text-base font-semibold text-ink-100">{APP_HEADLINE}</p>
          <p className="text-sm text-ink-400">{APP_TAGLINE}</p>
        </div>
        <ThemePicker />
      </header>

      <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
        <main>
          <div className="mb-4">
            <ImportPanel />
          </div>

          <form onSubmit={create} className="mb-8 rounded-xl border border-ink-700 bg-ink-900 p-4">
            <h2 className="panel-title mb-3">Or start a new project</h2>
            <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr_auto] sm:items-end">
              <label>
                <span className="label">Name</span>
                <input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="Untitled project" maxLength={100} />
              </label>
              <div>
                <span className="label">Format</span>
                <div className="flex rounded-md border border-ink-600 p-0.5">
                  {(Object.keys(FORMATS) as FormatId[]).map((f) => (
                    <button
                      type="button"
                      key={f}
                      onClick={() => setFormat(f)}
                      className={`rounded px-3 py-1 text-sm ${format === f ? "bg-ink-700 text-white" : "text-ink-400 hover:text-ink-200"}`}
                    >
                      {f === "landscape" ? "16:9" : "9:16"}
                    </button>
                  ))}
                </div>
              </div>
              <label>
                <span className="label">Start from template</span>
                <select className="field" value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.custom ? "★ " : ""}
                      {t.name}
                    </option>
                  ))}
                </select>
              </label>
              <button className="btn btn-primary" disabled={busy}>
                {busy ? "Creating…" : "Create"}
              </button>
            </div>
            {error ? <p className="mt-2 text-sm text-bad">{error}</p> : null}
          </form>


          <h2 className="panel-title mb-3">Projects</h2>
          {projects.length === 0 ? (
            <p className="text-sm text-ink-500">No projects yet. Create one above, or run <code>npm run seed</code> for the example.</p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {projects.map((p) => (
                <ProjectCard key={p.id} project={p} onDelete={() => remove(p)} />
              ))}
            </div>
          )}
        </main>

        <aside>
          <h2 className="panel-title mb-3">Render queue</h2>
          <RenderList />
        </aside>
      </div>
    </div>
  );
}
