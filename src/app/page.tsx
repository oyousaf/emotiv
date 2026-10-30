import { Dashboard, type DashboardProject } from "@/components/Dashboard";
import { buildCompositionProps, editorAssetUrl } from "@/lib/props";
import { BUILTIN_TEMPLATES } from "@/lib/templates";
import { getProject, listAssets, listCustomTemplates, listProjects } from "@/lib/server/repo";
import { ensureExampleProject } from "@/lib/server/seed";

export const dynamic = "force-dynamic";

export default async function Home() {
  await ensureExampleProject();
  const projects: DashboardProject[] = listProjects().map((summary) => {
    const project = getProject(summary.id)!;
    return { ...summary, props: buildCompositionProps(project.doc, listAssets(summary.id), editorAssetUrl) };
  });
  const templates = [
    ...BUILTIN_TEMPLATES.map(({ id, name, description }) => ({ id, name, description, custom: false })),
    ...listCustomTemplates().map(({ id, name, description }) => ({ id, name, description, custom: true })),
  ];
  return <Dashboard projects={projects} templates={templates} />;
}
