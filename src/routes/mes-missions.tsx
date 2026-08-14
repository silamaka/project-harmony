import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/app-shell";
import { MissionsTable } from "@/components/shared/missions-table";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/context/auth-context";
import { clientService, commentService, deliverableService, missionService } from "@/services";
import {
  MISSION_STATUS_LABELS,
  MISSION_WORKFLOW,
  type MissionStatus,
  type Priority,
} from "@/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/mes-missions")({
  head: () => ({
    meta: [
      { title: "Mes missions — BEBA EMPIRE" },
      {
        name: "description",
        content: "Vos missions assignées, leurs échéances et leur avancement.",
      },
      { property: "og:title", content: "Mes missions — BEBA EMPIRE" },
      { property: "og:description", content: "Suivi personnel des missions assignées." },
    ],
  }),
  component: MyMissionsPage,
});

const STATUS_FILTERS = ["tous", ...MISSION_WORKFLOW] as const;

function MyMissionsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_FILTERS)[number]>("tous");

  const { data: missions } = useQuery({
    queryKey: ["missions", "assignee", user?.id],
    queryFn: () => missionService.byAssignee(user!.id),
    enabled: !!user,
  });
  const { data: clients } = useQuery({ queryKey: ["clients"], queryFn: clientService.list });
  const { data: deliverables } = useQuery({
    queryKey: ["deliverables"],
    queryFn: deliverableService.list,
  });
  const { data: comments } = useQuery({ queryKey: ["comments"], queryFn: commentService.list });

  const ownMissions = useMemo(() => missions ?? [], [missions]);
  const clientName = (id: string) => (clients ?? []).find((c) => c.id === id)?.name ?? "—";
  const missionDeliverables = (missionId: string) =>
    (deliverables ?? []).filter((d) => d.mission_id === missionId);
  const lastComment = (missionId: string) => {
    const list = (comments ?? [])
      .filter((c) => c.mission_id === missionId)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return list[0]?.body ?? "";
  };

  const filtered = useMemo(
    () =>
      ownMissions.filter(
        (m) =>
          (statusFilter === "tous" || m.status === statusFilter) &&
          (m.title.toLowerCase().includes(query.toLowerCase()) ||
            m.objective.toLowerCase().includes(query.toLowerCase())),
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

  return (
    <AppShell
      title="Mes missions"
      subtitle={`${ownMissions.length} mission(s) assignée(s)`}
      allow={["collaborateur"]}
    >
      <div className="flex flex-wrap items-center gap-3">
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
              {s === "tous" ? "Toutes" : MISSION_STATUS_LABELS[s]}
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
          emptyMessage="Aucune mission pour ce filtre."
        />
      </div>
    </AppShell>
  );
}
