import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, CalendarDays, User } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/app-shell";
import { MissionStatusBadge, PriorityBadge, ProjectStatusBadge } from "@/components/shared/badges";
import { CreateMissionDialog } from "@/components/shared/create-dialogs";
import { ConfirmDeleteButton, EditProjectDialog } from "@/components/shared/edit-dialogs";
import { Progress } from "@/components/ui/progress";
import { clientService, missionService, projectService, userService } from "@/services";

export const Route = createFileRoute("/projets/$projectId")({
  head: () => ({
    meta: [
      { title: "Détail projet — BEBA EMPIRE" },
      { name: "description", content: "Détail du projet, missions associées et progression." },
      { property: "og:title", content: "Détail projet — BEBA EMPIRE" },
      { property: "og:description", content: "Suivi complet du projet client." },
    ],
  }),
  component: ProjectDetailPage,
});

function ProjectDetailPage() {
  const { projectId } = Route.useParams();
  const { data: project } = useQuery({
    queryKey: ["projects", projectId],
    queryFn: () => projectService.get(projectId),
  });
  const { data: missions } = useQuery({
    queryKey: ["missions", "project", projectId],
    queryFn: () => missionService.byProject(projectId),
  });
  const { data: clients } = useQuery({ queryKey: ["clients"], queryFn: clientService.list });
  const { data: users } = useQuery({ queryKey: ["users"], queryFn: userService.list });

  const navigate = useNavigate();
  const qc = useQueryClient();
  const removeProject = useMutation({
    mutationFn: () => projectService.remove(projectId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["projects"] });
      toast.success("Projet supprimé.");
      void navigate({ to: "/projets" });
    },
    onError: () => toast.error("Suppression impossible."),
  });

  const client = clients?.find((c) => c.id === project?.client_id);
  const owner = users?.find((u) => u.id === project?.owner_id);

  return (
    <AppShell
      title={project?.name ?? "Projet"}
      subtitle={client?.name}
      allow={["admin", "chef_projet"]}
      actions={
        project ? (
          <div className="flex items-center gap-2">
            <CreateMissionDialog projectId={project.id} />
            <EditProjectDialog project={project} />
            <ConfirmDeleteButton
              title="Supprimer ce projet ?"
              description="Le projet sera retiré de la liste. Cette action est irréversible."
              pending={removeProject.isPending}
              onConfirm={() => removeProject.mutate()}
            />
          </div>
        ) : undefined
      }
    >
      <Link
        to="/projets"
        className="inline-flex items-center gap-2 text-xs font-medium text-primary hover:underline"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Retour aux projets
      </Link>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <div className="surface-card p-5 lg:col-span-2">
          <div className="flex flex-wrap items-center gap-3">
            {project && <ProjectStatusBadge status={project.status} />}
            <span className="text-xs text-muted-foreground">
              {project && new Date(project.start_date).toLocaleDateString("fr-FR")} →{" "}
              {project && new Date(project.end_date).toLocaleDateString("fr-FR")}
            </span>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">{project?.description}</p>
          <div className="mt-6">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Progression</span>
              <span className="font-semibold">{project?.progress ?? 0}%</span>
            </div>
            <Progress value={project?.progress ?? 0} className="mt-2 h-2.5" />
          </div>
        </div>

        <div className="surface-card p-5">
          <h2 className="text-sm font-semibold">Informations</h2>
          <ul className="mt-4 space-y-3 text-sm text-muted-foreground">
            <li className="flex items-center gap-2">
              <User className="h-4 w-4" /> Responsable :{" "}
              <span className="font-medium text-foreground">
                {owner ? `${owner.first_name} ${owner.last_name}` : "—"}
              </span>
            </li>
            <li className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4" /> {missions?.length ?? 0} mission(s)
            </li>
          </ul>
        </div>
      </div>

      <div className="surface-card mt-4 p-5">
        <h2 className="text-sm font-semibold">Missions du projet</h2>
        <div className="mt-4 space-y-2">
          {(missions ?? []).map((m) => (
            <Link
              key={m.id}
              to="/missions/$missionId"
              params={{ missionId: m.id }}
              className="flex flex-wrap items-center gap-3 rounded-lg border border-border px-4 py-3 text-sm transition-colors hover:bg-accent/40"
            >
              <span className="min-w-0 flex-1 truncate font-medium">{m.title}</span>
              <PriorityBadge priority={m.priority} />
              <MissionStatusBadge status={m.status} />
              <span className="text-xs text-muted-foreground">
                {new Date(m.deadline).toLocaleDateString("fr-FR")}
              </span>
            </Link>
          ))}
          {(missions ?? []).length === 0 && (
            <p className="text-xs text-muted-foreground">Aucune mission sur ce projet.</p>
          )}
        </div>
      </div>
    </AppShell>
  );
}
