import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/app-shell";
import { ClientDeliverables } from "@/components/shared/client-deliverables";
import { CreateMissionDialog } from "@/components/shared/create-dialogs";
import {
  ConfirmDeleteButton,
  EditClientDialog,
  EditMissionDialog,
} from "@/components/shared/edit-dialogs";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/context/auth-context";
import { MissionsTable } from "@/components/shared/missions-table";
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
  type Mission,
  type MissionStatus,
  type Priority,
} from "@/types";

export const Route = createFileRoute("/clients/$clientId")({
  head: () => ({
    meta: [
      { title: "Fiche client — OLYMPE" },
      {
        name: "description",
        content: "Suivi détaillé des missions et des livrables du compte client.",
      },
      { property: "og:title", content: "Fiche client — OLYMPE" },
      { property: "og:description", content: "Priorité, actions, deadline et statut par mission." },
    ],
  }),
  component: ClientDetailPage,
});

const STATUS_FILTERS = ["tous", ...MISSION_WORKFLOW] as const;

function ClientDetailPage() {
  const { clientId } = Route.useParams();
  const { hasRole } = useAuth();
  const canManage = hasRole("admin", "chef_projet");
  const qc = useQueryClient();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_FILTERS)[number]>("tous");
  const [editingMission, setEditingMission] = useState<Mission | null>(null);
  const [deletingMission, setDeletingMission] = useState<Mission | null>(null);
  const [tab, setTab] = useState<"missions" | "livrables">("missions");

  const { data: client } = useQuery({
    queryKey: ["clients", clientId],
    queryFn: () => clientService.get(clientId),
  });
  const { data: projects } = useQuery({
    queryKey: ["projects", "client", clientId],
    queryFn: () => projectService.byClient(clientId),
  });
  const { data: missions } = useQuery({ queryKey: ["missions"], queryFn: missionService.list });
  const { data: deliverables } = useQuery({
    queryKey: ["deliverables"],
    queryFn: deliverableService.list,
  });
  const { data: comments } = useQuery({ queryKey: ["comments"], queryFn: commentService.list });
  const { data: users } = useQuery({ queryKey: ["users"], queryFn: userService.list });

  const projectIds = new Set((projects ?? []).map((p) => p.id));
  const clientMissions = (missions ?? []).filter(
    (m) => m.client_id === clientId || projectIds.has(m.project_id),
  );

  const collaborators = (users ?? []).filter((u) => u.role !== "client");
  const assigneeOptions: Record<string, string> = Object.fromEntries(
    collaborators.map((u) => [u.id, `${u.first_name} ${u.last_name}`]),
  );
  const assigneeTone: Record<string, string> = Object.fromEntries(
    collaborators.map((u) => [u.id, "bg-accent text-accent-foreground"]),
  );

  const filtered = useMemo(
    () =>
      clientMissions.filter(
        (m) =>
          (statusFilter === "tous" || m.status === statusFilter) &&
          m.title.toLowerCase().includes(query.toLowerCase()),
      ),
    [clientMissions, query, statusFilter],
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

  const lastComment = (missionId: string) => {
    const list = (comments ?? [])
      .filter((c) => c.mission_id === missionId)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return list[0]?.body ?? "";
  };

  const missionDeliverables = (missionId: string) =>
    (deliverables ?? []).filter((d) => d.mission_id === missionId);
  const clientMissionIds = new Set(clientMissions.map((m) => m.id));
  const clientDeliverables = (deliverables ?? []).filter((d) => clientMissionIds.has(d.mission_id));

  return (
    <AppShell
      title={client?.name ?? "Client"}
      subtitle={client ? `${client.industry} · ${clientMissions.length} mission(s)` : undefined}
      allow={["admin", "chef_projet", "collaborateur"]}
      actions={
        client && canManage ? (
          <div className="flex items-center gap-2">
            <EditClientDialog client={client} />
            <CreateMissionDialog clientId={client.id} />
          </div>
        ) : undefined
      }
    >
      <Link
        to="/clients"
        className="inline-flex items-center gap-2 text-xs font-medium text-primary hover:underline"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Retour aux clients
      </Link>

      <div className="mt-4 flex gap-1 border-b border-border">
        {(
          [
            ["missions", "Missions", clientMissions.length],
            ["livrables", "Livrables", clientDeliverables.length],
          ] as const
        ).map(([value, label, count]) => (
          <button
            key={value}
            onClick={() => setTab(value)}
            className={cn(
              "-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors",
              tab === value
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {label}{" "}
            <span className="ml-1 rounded-full bg-muted px-1.5 py-0.5 text-[11px]">{count}</span>
          </button>
        ))}
      </div>

      {tab === "livrables" ? (
        <div className="mt-4">
          <ClientDeliverables
            deliverables={clientDeliverables}
            missions={clientMissions}
            users={users ?? []}
          />
        </div>
      ) : (
        <>
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
              showResponsable={canManage}
              assigneeOptions={assigneeOptions}
              assigneeTone={assigneeTone}
              deliverablesFor={missionDeliverables}
              commentFor={lastComment}
              onStatusChange={(id, status) => updateStatus.mutate({ id, status })}
              onPriorityChange={(id, priority) => updatePriority.mutate({ id, priority })}
              emptyMessage="Aucune mission pour ce client."
              {...(canManage
                ? {
                    onAssigneeChange: (id: string, assignee_id: string) =>
                      updateAssignee.mutate({ id, assignee_id }),
                    onEditMission: setEditingMission,
                    onDeleteMission: setDeletingMission,
                  }
                : {})}
            />
          </div>
        </>
      )}

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
