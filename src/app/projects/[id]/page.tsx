import { notFound } from "next/navigation";
import { Editor } from "@/components/editor/Editor";
import { BUILTIN_TEMPLATES } from "@/lib/templates";
import { isSafeId } from "@/lib/server/paths";
import { getProject, listAssets, listCustomTemplates } from "@/lib/server/repo";

export const dynamic = "force-dynamic";

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isSafeId(id)) notFound();
  const project = getProject(id);
  if (!project) notFound();
  return (
    <Editor
      project={project}
      initialAssets={listAssets(id)}
      builtinTemplates={BUILTIN_TEMPLATES.map(({ id, name, category, description }) => ({ id, name, category, description }))}
      initialCustomTemplates={listCustomTemplates()}
    />
  );
}
