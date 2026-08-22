import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, CalendarDays, Search, User } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/app-shell";
import { projectTone } from "@/components/shared/badges";
import { CreateMissionDialog } from "@/components/shared/create-dialogs";
import {
  ConfirmDeleteButton,
  EditMissionDialog,
  EditProjectDialog,
} from "@/components/shared/edit-dialogs";
import { MissionsTable } from "@/components/shared/missions-table";
import { PillSelect } from "@/components/shared/pill-select";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import {
  clientService,
  commentService,
  deliverableService,
  missionService,
  projectService,
  userService,
} from "@/services";
import {
  MISSION_STATUS_LABELS,
  MISSION_WORKFLOW,
  PROJECT_STATUS_LABELS,
  type Mission,
  type MissionStatus,
  type Priority,
  type ProjectStatus,
} from "@/types";

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

const STATUS_FILTERS = ["tous", ...MISSION_WORKFLOW] as const;

function ProjectDetailPage() {
  const { projectId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_FILTERS)[number]>("tous");
  const [editingMission, setEditingMission] = useState<Mission | null>(null);
  const [deletingMission, setDeletingMission] = useState<Mission | null>(null);

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
  const { data: deliverables } = useQuery({
    queryKey: ["deliverables"],
    queryFn: deliverableService.list,
  });
  const { data: comments } = useQuery({ queryKey: ["comments"], queryFn: commentService.list });

  const removeProject = useMutation({
    mutationFn: () => projectService.remove(projectId),
    onSuccess: () => {
      toast.success("Projet supprimé.");
      // On invalide "projects" seulement une fois la navigation terminée : sinon la requête
      // ["projects", projectId] encore montée se refetch sur une fiche déjà supprimée et échoue
      // (queryFn qui retourne undefined), ce qui laisse la page dans un état incohérent.
      void navigate({ to: "/projets" }).then(() =>
        qc.invalidateQueries({ queryKey: ["projects"] }),
      );
    },
    onError: () => toast.error("Suppression impossible."),
  });

  const updateProjectStatus = useMutation({
    mutationFn: (status: ProjectStatus) => projectService.update(projectId, { status }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["projects"] });
      void qc.invalidateQueries({ queryKey: ["projects", projectId] });
    },
    onError: () => toast.error("Mise à jour du statut impossible."),
  });

  const updateMissionStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: MissionStatus }) =>
      missionService.updateStatus(id, status),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["missions", "project", projectId] }),
    onError: () => toast.error("Mise à jour du statut impossible."),
  });

  const updateMissionPriority = useMutation({
    mutationFn: ({ id, priority }: { id: string; priority: Priority }) =>
      missionService.update(id, { priority }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["missions", "project", projectId] }),
    onError: () => toast.error("Mise à jour de la priorité impossible."),
  });

  const updateMissionAssignee = useMutation({
    mutationFn: ({ id, assignee_id }: { id: string; assignee_id: string }) =>
      missionService.update(id, { assignee_id }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["missions", "project", projectId] }),
    onError: () => toast.error("Réassignation impossible."),
  });

  const removeMission = useMutation({
    mutationFn: (id: string) => missionService.remove(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["missions", "project", projectId] });
      toast.success("Mission supprimée.");
      setDeletingMission(null);
    },
    onError: () => toast.error("Suppression impossible."),
  });

  const client = clients?.find((c) => c.id === project?.client_id);
  const owner = users?.find((u) => u.id === project?.owner_id);
  const collaborators = (users ?? []).filter((u) => u.role !== "client");
  const assigneeOptions: Record<string, string> = Object.fromEntries(
    collaborators.map((u) => [u.id, `${u.first_name} ${u.last_name}`]),
  );
  const assigneeTone: Record<string, string> = Object.fromEntries(
    collaborators.map((u) => [u.id, "bg-accent text-accent-foreground"]),
  );

  const projectMissions = useMemo(() => missions ?? [], [missions]);
  const filtered = useMemo(
    () =>
      projectMissions.filter(
        (m) =>
          (statusFilter === "tous" || m.status === statusFilter) &&
          m.title.toLowerCase().includes(query.toLowerCase()),
      ),
    [projectMissions, query, statusFilter],
  );

  const lastComment = (missionId: string) => {
    const list = (comments ?? [])
      .filter((c) => c.mission_id === missionId)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return list[0]?.body ?? "";
  };

  const missionDeliverables = (missionId: string) =>
    (deliverables ?? []).filter((d) => d.mission_id === missionId);

  return (
    <AppShell
      title={project?.name ?? "Projet"}
      subtitle={client?.name}
      allow={["admin", "chef_projet"]}
      actions={
        project ? (
          <div className="flex items-center gap-2">
            <CreateMissionDialog projectId={project.id} />
            <EditProjectDialog key={project.id} project={project} />
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
            {project && (
              <PillSelect
                value={project.status}
                options={PROJECT_STATUS_LABELS}
                tone={projectTone}
                onChange={(v) => updateProjectStatus.mutate(v as ProjectStatus)}
              />
            )}
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
              <CalendarDays className="h-4 w-4" /> {projectMissions.length} mission(s)
            </li>
          </ul>
        </div>
      </div>

      <h2 className="mt-6 text-sm font-semibold">Missions du projet</h2>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <div className="relative min-w-56 flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Rechercher une mission..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap gap-1 rounded-lg border border-border p-1">
          {STATUS_FILTERS.map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                statusFilter === s
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent",
              )}
            >
              {s === "tous" ? "Tous" : MISSION_STATUS_LABELS[s]}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3">
        <MissionsTable
          missions={filtered}
          showResponsable
          assigneeOptions={assigneeOptions}
          assigneeTone={assigneeTone}
          deliverablesFor={missionDeliverables}
          commentFor={lastComment}
          onStatusChange={(id, status) => updateMissionStatus.mutate({ id, status })}
          onPriorityChange={(id, priority) => updateMissionPriority.mutate({ id, priority })}
          onAssigneeChange={(id, assignee_id) => updateMissionAssignee.mutate({ id, assignee_id })}
          onEditMission={setEditingMission}
          onDeleteMission={setDeletingMission}
          emptyMessage="Aucune mission sur ce projet."
        />
      </div>

      {editingMission && (
        <EditMissionDialog
          mission={editingMission}
          open
          onOpenChange={(o) => !o && setEditingMission(null)}
        />
      )}
      <ConfirmDeleteButton
        open={deletingMission !== null}
        onOpenChange={(o) => !o && setDeletingMission(null)}
        title={`Supprimer "${deletingMission?.title ?? ""}" ?`}
        description="La mission sera définitivement retirée. Cette action est irréversible."
        pending={removeMission.isPending}
        onConfirm={() => deletingMission && removeMission.mutate(deletingMission.id)}
      />
    </AppShell>
  );
}
