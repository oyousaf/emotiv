import type { AssetKind, FormatId, ProjectDoc } from "./schema";

/** Row shapes shared between the API and the editor (no server imports). */
export type AssetRecord = {
  id: string;
  projectId: string;
  kind: AssetKind;
  name: string;
  fileName: string;
  mime: string;
  size: number;
  family: string | null;
  durationInSeconds: number | null;
  width: number | null;
  height: number | null;
  createdAt: number;
};

export type ProjectSummary = {
  id: string;
  name: string;
  format: FormatId;
  sceneCount: number;
  durationInFrames: number;
  createdAt: number;
  updatedAt: number;
};

export type ProjectRecord = ProjectSummary & { doc: ProjectDoc };

export const RENDER_STATUSES = ["queued", "rendering", "done", "failed", "cancelled"] as const;
export type RenderStatus = (typeof RENDER_STATUSES)[number];
export const RENDER_QUALITIES = ["draft", "standard", "high"] as const;
export type RenderQuality = (typeof RENDER_QUALITIES)[number];

export type RenderJob = {
  id: string;
  projectId: string;
  projectName: string;
  status: RenderStatus;
  format: FormatId;
  quality: RenderQuality;
  progress: number;
  outputFile: string | null;
  error: string | null;
  createdAt: number;
  startedAt: number | null;
  finishedAt: number | null;
};

export type CustomTemplate = {
  id: string;
  name: string;
  category: "custom";
  description: string;
  createdAt: number;
};
