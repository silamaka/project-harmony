import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Mail, Phone, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/app-shell";
import { UserAvatar } from "@/components/shared/avatar";
import { CreateMissionDialog, EditUserDialog } from "@/components/shared/create-dialogs";
import { ConfirmDeleteButton, EditMissionDialog } from "@/components/shared/edit-dialogs";
import { MissionsTable } from "@/components/shared/missions-table";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import {
  clientService,
  commentService,
  deliverableService,
  missionService,
  userService,
} from "@/services";
import {
  MISSION_STATUS_LABELS,
  MISSION_WORKFLOW,
  type Mission,
  type MissionStatus,
  type Priority,
} from "@/types";

export const Route = createFileRoute("/collaborateurs/$userId")({
  head: () => ({
    meta: [
      { title: "Missions du collaborateur — BEBA EMPIRE" },
      { name: "description", content: "Toutes les missions assignées à ce collaborateur." },
      { property: "og:title", content: "Missions du collaborateur — BEBA EMPIRE" },
      {
        property: "og:description",
        content: "Priorité, statut, deadline et livrables par mission.",
      },
    ],
  }),
  component: CollaboratorDetailPage,
});

const STATUS_FILTERS = ["tous", ...MISSION_WORKFLOW] as const;

const workloadTone = (w: number) =>
  w >= 85 ? "bg-destructive" : w >= 60 ? "bg-warning" : "bg-primary";

function CollaboratorDetailPage() {
  const { userId } = Route.useParams();
  const qc = useQueryClient();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_FILTERS)[number]>("tous");
  const [editingMission, setEditingMission] = useState<Mission | null>(null);
  const [deletingMission, setDeletingMission] = useState<Mission | null>(null);

  const { data: collaborator } = useQuery({
    queryKey: ["users", userId],
    queryFn: () => userService.get(userId),
  });
  const { data: missions } = useQuery({ queryKey: ["missions"], queryFn: missionService.list });
  const { data: clients } = useQuery({ queryKey: ["clients"], queryFn: clientService.list });
  const { data: deliverables } = useQuery({
    queryKey: ["deliverables"],
    queryFn: deliverableService.list,
  });
  const { data: comments } = useQuery({ queryKey: ["comments"], queryFn: commentService.list });

  const ownMissions = (missions ?? []).filter((m) => m.assignee_id === userId);
  const clientName = (id: string) => (clients ?? []).find((c) => c.id === id)?.name ?? "—";

  const filtered = useMemo(
    () =>
      ownMissions.filter(
        (m) =>
          (statusFilter === "tous" || m.status === statusFilter) &&
          m.title.toLowerCase().includes(query.toLowerCase()),
      ),
    [ownMissions, query, statusFilter],
  );

  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: MissionStatus }) =>
      missionService.updateStatus(id, status),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["missions"] }),
    onError: () => toast.error("Mise à jour du statut impossible."),
  });

  const updatePriority = useMutation({
    mutationFn: ({ id, priority }: { id: string; priority: Priority }) =>
      missionService.update(id, { priority }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["missions"] }),
    onError: () => toast.error("Mise à jour de la priorité impossible."),
  });

  const removeMission = useMutation({
    mutationFn: (id: string) => missionService.remove(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["missions"] });
      toast.success("Mission supprimée.");
      setDeletingMission(null);
    },
    onError: () => toast.error("Suppression impossible."),
  });

  const lastComment = (missionId: string) => {
    const list = (comments ?? [])
      .filter((c) => c.mission_id === missionId)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return list[0]?.body ?? "";
  };

  const missionDeliverables = (missionId: string) =>
    (deliverables ?? []).filter((d) => d.mission_id === missionId);

  const workload = collaborator?.workload ?? 0;

  return (
    <AppShell
      title={
        collaborator ? `${collaborator.first_name} ${collaborator.last_name}` : "Collaborateur"
      }
      subtitle={
        collaborator
          ? `${collaborator.job_title ?? "Collaborateur"} · ${ownMissions.length} mission(s)`
          : undefined
      }
      allow={["admin", "chef_projet"]}
      actions={
        collaborator ? (
          <div className="flex items-center gap-2">
            <CreateMissionDialog assigneeId={collaborator.id} />
            <EditUserDialog user={collaborator} />
          </div>
        ) : undefined
      }
    >
      <Link
        to="/collaborateurs"
        className="inline-flex items-center gap-2 text-xs font-medium text-primary hover:underline"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Retour aux collaborateurs
      </Link>

      {collaborator && (
        <div className="surface-card mt-4 flex flex-wrap items-center gap-6 p-5">
          <UserAvatar user={collaborator} className="h-14 w-14 text-lg" />
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Mail className="h-3.5 w-3.5" /> {collaborator.email}
            </span>
            {collaborator.phone && (
              <span className="flex items-center gap-1.5">
                <Phone className="h-3.5 w-3.5" /> {collaborator.phone}
              </span>
            )}
            <span
              className={cn(
                "rounded-full px-2.5 py-0.5 text-xs font-semibold",
                collaborator.is_active
                  ? "bg-success/15 text-success"
                  : "bg-muted text-muted-foreground",
              )}
            >
              {collaborator.is_active ? "Actif" : "Inactif"}
            </span>
          </div>
          <div className="min-w-40 flex-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Charge de travail</span>
              <span className="font-semibold">{workload}%</span>
            </div>
            <Progress
              value={workload}
              className="mt-2 h-2"
              indicatorClassName={workloadTone(workload)}
            />
          </div>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
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

      <div className="mt-4">
        <MissionsTable
          missions={filtered}
          showClient
          clientName={clientName}
          deliverablesFor={missionDeliverables}
          commentFor={lastComment}
          onStatusChange={(id, status) => updateStatus.mutate({ id, status })}
          onPriorityChange={(id, priority) => updatePriority.mutate({ id, priority })}
          onEditMission={setEditingMission}
          onDeleteMission={setDeletingMission}
          emptyMessage="Aucune mission assignée."
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
