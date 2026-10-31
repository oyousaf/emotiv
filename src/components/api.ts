"use client";

import type { FormatId, ProjectDoc, Scene } from "@/lib/schema";
import type { AssetRecord, CustomTemplate, ProjectRecord, RenderJob, RenderQuality } from "@/lib/types";

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = body?.issues?.[0] ? ` (${body.issues[0].path?.join(".")}: ${body.issues[0].message})` : "";
    throw new Error((body?.error ?? `Request failed (${res.status})`) + detail);
  }
  return body as T;
}

const jsonInit = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export const api = {
  createProject: (name: string, format: FormatId, templateId: string) =>
    request<ProjectRecord>("/api/projects", jsonInit("POST", { name, format, templateId })),
  saveProject: (id: string, patch: { name?: string; doc?: ProjectDoc }) =>
    request<ProjectRecord>(`/api/projects/${id}`, jsonInit("PUT", patch)),
  deleteProject: (id: string) => request<{ ok: true }>(`/api/projects/${id}`, { method: "DELETE" }),

  uploadAssets: (projectId: string, files: File[]) => {
    const form = new FormData();
    files.forEach((f) => form.append("file", f));
    return request<AssetRecord[]>(`/api/projects/${projectId}/assets`, { method: "POST", body: form });
  },
  deleteAsset: (projectId: string, assetId: string) =>
    request<{ ok: true }>(`/api/projects/${projectId}/assets/${assetId}`, { method: "DELETE" }),

  listRenders: (projectId?: string) =>
    request<RenderJob[]>(projectId ? `/api/projects/${projectId}/renders` : "/api/renders"),
  enqueueRender: (projectId: string, format: FormatId, quality: RenderQuality) =>
    request<RenderJob>(`/api/projects/${projectId}/renders`, jsonInit("POST", { format, quality })),
  cancelRender: (id: string) => request<RenderJob>(`/api/renders/${id}/cancel`, { method: "POST" }),
  deleteRender: (id: string, deleteFile = false) =>
    request<{ ok: true }>(`/api/renders/${id}${deleteFile ? "?file" : ""}`, { method: "DELETE" }),
  workerStatus: () => request<{ online: boolean; lastSeen: number | null }>("/api/worker"),

  listTemplates: () =>
    request<{
      builtin: { id: string; name: string; category: string; description: string }[];
      custom: (CustomTemplate & { scene: Scene })[];
    }>("/api/templates"),
  saveTemplate: (name: string, scene: Scene) =>
    request<CustomTemplate>("/api/templates", jsonInit("POST", { name, scene })),
  deleteTemplate: (id: string) => request<{ ok: true }>(`/api/templates/${id}`, { method: "DELETE" }),
};
