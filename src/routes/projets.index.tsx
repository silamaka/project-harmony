import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCircle2, Clock, FolderKanban, Hourglass, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/app-shell";
import { projectTone } from "@/components/shared/badges";
import { CreateProjectDialog } from "@/components/shared/create-dialogs";
import { ConfirmDeleteButton, EditProjectDialog } from "@/components/shared/edit-dialogs";
import { PillSelect } from "@/components/shared/pill-select";
import { StatCard } from "@/components/shared/stat-card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { clientService, projectService, userService } from "@/services";
import { PROJECT_STATUS_LABELS, type Project, type ProjectStatus } from "@/types";

export const Route = createFileRoute("/projets/")({
  head: () => ({
    meta: [
      { title: "Projets — BEBA EMPIRE" },
      { name: "description", content: "Suivi des projets clients, statuts et progression." },
      { property: "og:title", content: "Projets — BEBA EMPIRE" },
      { property: "og:description", content: "Tous les projets de l'agence en un coup d'œil." },
    ],
  }),
  component: ProjectsPage,
});

const FILTERS: ("tous" | ProjectStatus)[] = [
  "tous",
  "brouillon",
  "en_preparation",
  "en_cours",
  "en_attente",
  "termine",
  "archive",
];

function ProjectsPage() {
  const qc = useQueryClient();
  const { data: projects } = useQuery({ queryKey: ["projects"], queryFn: projectService.list });
  const { data: clients } = useQuery({ queryKey: ["clients"], queryFn: clientService.list });
  const { data: users } = useQuery({ queryKey: ["users"], queryFn: userService.list });
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<(typeof FILTERS)[number]>("tous");

  const filtered = useMemo(
    () =>
      (projects ?? []).filter(
        (p) =>
          (status === "tous" || p.status === status) &&
          p.name.toLowerCase().includes(query.toLowerCase()),
      ),
    [projects, query, status],
  );

  const clientName = (id: string) => clients?.find((c) => c.id === id)?.name ?? "—";
  const ownerName = (id: string) => {
    const u = users?.find((x) => x.id === id);
    return u ? `${u.first_name} ${u.last_name}` : "—";
  };

  const allProjects = projects ?? [];
  const stats = {
    total: allProjects.length,
    enCours: allProjects.filter((p) => p.status === "en_cours").length,
    enAttente: allProjects.filter((p) => p.status === "en_attente").length,
    termines: allProjects.filter((p) => p.status === "termine").length,
  };

  const updateStatus = useMutation({
    mutationFn: ({ id, status: s }: { id: string; status: ProjectStatus }) =>
      projectService.update(id, { status: s }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["projects"] }),
    onError: () => toast.error("Mise à jour du statut impossible."),
  });

  const removeProject = useMutation({
    mutationFn: (id: string) => projectService.remove(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["projects"] });
      toast.success("Projet supprimé.");
    },
    onError: () => toast.error("Suppression impossible."),
  });

  return (
    <AppShell
      title="Projets"
      subtitle={`${filtered.length} projet(s)`}
      allow={["admin", "chef_projet"]}
      actions={<CreateProjectDialog />}
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Projets" value={stats.total} icon={FolderKanban} />
        <StatCard label="En cours" value={stats.enCours} icon={Clock} tone="info" delay={0.04} />
        <StatCard
          label="En attente"
          value={stats.enAttente}
          icon={Hourglass}
          tone="warning"
          delay={0.08}
        />
        <StatCard
          label="Terminés"
          value={stats.termines}
          icon={CheckCircle2}
          tone="success"
          delay={0.12}
        />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <div className="relative min-w-56 flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Rechercher un projet..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap gap-1 rounded-lg border border-border p-1">
          {FILTERS.map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                status === s
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent",
              )}
            >
              {s === "tous" ? "Tous" : PROJECT_STATUS_LABELS[s]}
            </button>
          ))}
        </div>
      </div>

      <div className="surface-card mt-6 overflow-hidden">
        <div className="max-h-[70vh] overflow-auto">
          <table className="w-full min-w-[700px] table-fixed border-collapse text-sm">
            <colgroup>
              <col className="w-[22%]" />
              <col className="w-[15%]" />
              <col className="w-[13%]" />
              <col className="w-[10%]" />
              <col className="w-[16%]" />
              <col className="w-[13%]" />
              <col className="w-[11%]" />
            </colgroup>
            <thead>
              <tr className="sticky top-0 z-10 bg-muted text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground shadow-[inset_0_-1px_0_var(--color-border)]">
                <th className="px-3 py-3">Projet</th>
                <th className="px-3 py-3">Client</th>
                <th className="px-3 py-3">Responsable</th>
                <th className="px-3 py-3">Échéance</th>
                <th className="px-3 py-3">Statut</th>
                <th className="px-3 py-3">Progression</th>
                <th className="px-3 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <ProjectRow
                  key={p.id}
                  project={p}
                  client={clientName(p.client_id)}
                  owner={ownerName(p.owner_id)}
                  onStatusChange={(s) => updateStatus.mutate({ id: p.id, status: s })}
                  onDelete={() => removeProject.mutate(p.id)}
                  deletePending={removeProject.isPending && removeProject.variables === p.id}
                />
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-sm text-muted-foreground">
                    Aucun projet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}

function ProjectRow({
  project,
  client,
  owner,
  onStatusChange,
  onDelete,
  deletePending,
}: {
  project: Project;
  client: string;
  owner: string;
  onStatusChange: (status: ProjectStatus) => void;
  onDelete: () => void;
  deletePending: boolean;
}) {
  return (
    <tr className="border-t border-border align-top transition-colors hover:bg-accent/20">
      <td className="px-3 py-3">
        <Link
          to="/projets/$projectId"
          params={{ projectId: project.id }}
          className="line-clamp-2 font-medium break-words text-primary hover:underline"
        >
          {project.name}
        </Link>
      </td>
      <td className="truncate px-3 py-3 text-xs text-muted-foreground" title={client}>
        {client}
      </td>
      <td className="truncate px-3 py-3 text-xs text-muted-foreground" title={owner}>
        {owner}
      </td>
      <td className="px-3 py-3 text-xs whitespace-nowrap text-muted-foreground">
        {new Date(project.end_date).toLocaleDateString("fr-FR")}
      </td>
      <td className="overflow-hidden px-3 py-3 pr-4">
        <PillSelect
          value={project.status}
          options={PROJECT_STATUS_LABELS}
          tone={projectTone}
          onChange={(v) => onStatusChange(v as ProjectStatus)}
        />
      </td>
      <td className="px-3 py-3">
        <div className="flex items-center gap-2">
          <Progress value={project.progress} className="h-2 w-full" />
          <span className="shrink-0 text-xs font-semibold">{project.progress}%</span>
        </div>
      </td>
      <td className="px-3 py-3 pl-2">
        <div className="flex items-center justify-end gap-2.5">
          <EditProjectDialog project={project} iconOnly />
          <ConfirmDeleteButton
            iconOnly
            title={`Supprimer ${project.name} ?`}
            description="Le projet sera retiré de la liste. Cette action est irréversible."
            pending={deletePending}
            onConfirm={onDelete}
          />
        </div>
      </td>
    </tr>
  );
}
