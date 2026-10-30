import type { CompositionProps, FormatId, ProjectDoc, ResolvedAsset } from "./schema";
import type { AssetRecord } from "./types";

/**
 * Turn a project document plus its asset rows into composition props.
 * `urlFor` decides where media is served from: the Next.js API in the editor,
 * or the render worker's local file server during export.
 */
export function buildCompositionProps(
  doc: ProjectDoc,
  assets: AssetRecord[],
  urlFor: (asset: AssetRecord) => string,
  format?: FormatId,
): CompositionProps {
  const resolved: Record<string, ResolvedAsset> = {};
  for (const a of assets) {
    resolved[a.id] = {
      id: a.id,
      kind: a.kind,
      url: urlFor(a),
      name: a.name,
      family: a.family,
      durationInSeconds: a.durationInSeconds,
      width: a.width,
      height: a.height,
    };
  }
  return { doc, assets: resolved, format: format ?? doc.format };
}

export const editorAssetUrl = (a: Pick<AssetRecord, "projectId" | "fileName">) =>
  `/api/projects/${a.projectId}/files/${a.fileName}`;
