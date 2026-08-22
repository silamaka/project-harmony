import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { AlertTriangle, CheckCircle2, Clock, ListChecks, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/app-shell";
import { CreateMissionDialog } from "@/components/shared/create-dialogs";
import { ConfirmDeleteButton, EditMissionDialog } from "@/components/shared/edit-dialogs";
import { MissionsTable } from "@/components/shared/missions-table";
import { StatCard } from "@/components/shared/stat-card";
import { Input } from "@/components/ui/input";
import {
  clientService,
  commentService,
  deliverableService,
  isLate,
  missionService,
  userService,
} from "@/services";
import { type Mission, type MissionStatus, type Priority } from "@/types";

export const Route = createFileRoute("/missions/")({
  head: () => ({
    meta: [
      { title: "Missions — BEBA EMPIRE" },
      {
        name: "description",
        content: "Suivi détaillé des missions : du brief à la validation client.",
      },
      { property: "og:title", content: "Missions — BEBA EMPIRE" },
      { property: "og:description", content: "Priorité, actions, deadline et statut par mission." },
    ],
  }),
  component: MissionsPage,
});

function MissionsPage() {
  const qc = useQueryClient();
  const { data: missions } = useQuery({ queryKey: ["missions"], queryFn: missionService.list });
  const { data: users } = useQuery({ queryKey: ["users"], queryFn: userService.list });
  const { data: clients } = useQuery({ queryKey: ["clients"], queryFn: clientService.list });
  const { data: deliverables } = useQuery({
    queryKey: ["deliverables"],
    queryFn: deliverableService.list,
  });
  const { data: comments } = useQuery({ queryKey: ["comments"], queryFn: commentService.list });
  const [query, setQuery] = useState("");
  const [editingMission, setEditingMission] = useState<Mission | null>(null);
  const [deletingMission, setDeletingMission] = useState<Mission | null>(null);

  const filtered = useMemo(
    () => (missions ?? []).filter((m) => m.title.toLowerCase().includes(query.toLowerCase())),
    [missions, query],
  );

  const allMissions = missions ?? [];
  const stats = {
    total: allMissions.length,
    enCours: allMissions.filter((m) => m.status === "en_cours").length,
    enRetard: allMissions.filter(isLate).length,
    terminees: allMissions.filter((m) => ["valide", "publie", "termine"].includes(m.status)).length,
  };

  const clientName = (id: string) => clients?.find((c) => c.id === id)?.name ?? "—";
  const collaborators = (users ?? []).filter((u) => u.role !== "client");
  const assigneeOptions: Record<string, string> = Object.fromEntries(
    collaborators.map((u) => [u.id, `${u.first_name} ${u.last_name}`]),
  );
  const assigneeTone: Record<string, string> = Object.fromEntries(
    collaborators.map((u) => [u.id, "bg-accent text-accent-foreground"]),
  );
  const missionDeliverables = (missionId: string) =>
    (deliverables ?? []).filter((d) => d.mission_id === missionId);
  const lastComment = (missionId: string) => {
    const list = (comments ?? [])
      .filter((c) => c.mission_id === missionId)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return list[0]?.body ?? "";
  };

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

  const updateAssignee = useMutation({
    mutationFn: ({ id, assignee_id }: { id: string; assignee_id: string }) =>
      missionService.update(id, { assignee_id }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["missions"] }),
    onError: () => toast.error("Réassignation impossible."),
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

  return (
    <AppShell
      title="Missions"
      subtitle={`${filtered.length} mission(s) · workflow agence`}
      allow={["admin", "chef_projet"]}
      actions={<CreateMissionDialog />}
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Missions" value={stats.total} icon={ListChecks} />
        <StatCard label="En cours" value={stats.enCours} icon={Clock} tone="info" delay={0.04} />
        <StatCard
          label="En retard"
          value={stats.enRetard}
          icon={AlertTriangle}
          tone="danger"
          delay={0.08}
        />
        <StatCard
          label="Terminées"
          value={stats.terminees}
          icon={CheckCircle2}
          tone="success"
          delay={0.12}
        />
      </div>

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
      </div>

      <div className="mt-6">
        <MissionsTable
          missions={filtered}
          showClient
          clientName={clientName}
          showResponsable
          assigneeOptions={assigneeOptions}
          assigneeTone={assigneeTone}
          deliverablesFor={missionDeliverables}
          commentFor={lastComment}
          onStatusChange={(id, status) => updateStatus.mutate({ id, status })}
          onPriorityChange={(id, priority) => updatePriority.mutate({ id, priority })}
          onAssigneeChange={(id, assignee_id) => updateAssignee.mutate({ id, assignee_id })}
          onEditMission={setEditingMission}
          onDeleteMission={setDeletingMission}
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
