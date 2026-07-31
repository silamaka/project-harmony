import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { LayoutGrid, List, Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/app-shell";
import { MissionStatusBadge, PriorityBadge } from "@/components/shared/badges";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { clientService, missionService, userService } from "@/services";
import { MISSION_STATUS_LABELS, MISSION_WORKFLOW, type Mission } from "@/types";

export const Route = createFileRoute("/missions/")({
  head: () => ({
    meta: [
      { title: "Missions — BEBA EMPIRE" },
      { name: "description", content: "Kanban des missions : du brief à la validation client." },
      { property: "og:title", content: "Missions — BEBA EMPIRE" },
      { property: "og:description", content: "Workflow complet des missions de l'agence." },
    ],
  }),
  component: MissionsPage,
});

function MissionsPage() {
  const { data: missions } = useQuery({ queryKey: ["missions"], queryFn: missionService.list });
  const { data: users } = useQuery({ queryKey: ["users"], queryFn: userService.list });
  const { data: clients } = useQuery({ queryKey: ["clients"], queryFn: clientService.list });
  const [view, setView] = useState<"kanban" | "liste">("kanban");
  const [query, setQuery] = useState("");

  const filtered = useMemo(
    () => (missions ?? []).filter((m) => m.title.toLowerCase().includes(query.toLowerCase())),
    [missions, query],
  );

  const assignee = (id: string) => {
    const u = users?.find((x) => x.id === id);
    return u ? `${u.first_name} ${u.last_name}` : "—";
  };
  const clientName = (id: string) => clients?.find((c) => c.id === id)?.name ?? "—";

  return (
    <AppShell
      title="Missions"
      subtitle={`${filtered.length} mission(s) · workflow agence`}
      allow={["admin", "chef_projet"]}
      actions={
        <Button size="sm" onClick={() => toast.info("Formulaire de création mission à connecter.")}>
          <Plus className="mr-1 h-4 w-4" /> Nouvelle mission
        </Button>
      }
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
        <div className="flex gap-1 rounded-lg border border-border p-1">
          <button
            onClick={() => setView("kanban")}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              view === "kanban" ? "bg-primary text-primary-foreground" : "text-muted-foreground",
            )}
          >
            <LayoutGrid className="h-3.5 w-3.5" /> Kanban
          </button>
          <button
            onClick={() => setView("liste")}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              view === "liste" ? "bg-primary text-primary-foreground" : "text-muted-foreground",
            )}
          >
            <List className="h-3.5 w-3.5" /> Liste
          </button>
        </div>
      </div>

      {view === "kanban" ? (
        <div className="mt-6 flex gap-4 overflow-x-auto pb-4">
          {MISSION_WORKFLOW.map((status) => {
            const items = filtered.filter((m) => m.status === status);
            return (
              <div key={status} className="w-72 shrink-0">
                <div className="mb-3 flex items-center justify-between px-1">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {MISSION_STATUS_LABELS[status]}
                  </p>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-bold">
                    {items.length}
                  </span>
                </div>
                <div className="space-y-3 rounded-xl bg-muted/40 p-2">
                  {items.map((m) => (
                    <MissionCard key={m.id} mission={m} assignee={assignee(m.assignee_id)} client={clientName(m.client_id)} />
                  ))}
                  {items.length === 0 && (
                    <p className="px-2 py-6 text-center text-xs text-muted-foreground">Vide</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="surface-card mt-6 overflow-x-auto p-1">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                <th className="px-4 py-3 font-medium">Mission</th>
                <th className="px-4 py-3 font-medium">Client</th>
                <th className="px-4 py-3 font-medium">Responsable</th>
                <th className="px-4 py-3 font-medium">Priorité</th>
                <th className="px-4 py-3 font-medium">Statut</th>
                <th className="px-4 py-3 font-medium">Deadline</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((m) => (
                <tr key={m.id} className="border-b border-border/60 last:border-0 hover:bg-accent/30">
                  <td className="px-4 py-3 font-medium">
                    <Link to="/missions/$missionId" params={{ missionId: m.id }} className="hover:text-primary">
                      {m.title}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{clientName(m.client_id)}</td>
                  <td className="px-4 py-3 text-muted-foreground">{assignee(m.assignee_id)}</td>
                  <td className="px-4 py-3">
                    <PriorityBadge priority={m.priority} />
                  </td>
                  <td className="px-4 py-3">
                    <MissionStatusBadge status={m.status} />
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {new Date(m.deadline).toLocaleDateString("fr-FR")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AppShell>
  );
}

function MissionCard({
  mission,
  assignee,
  client,
}: {
  mission: Mission;
  assignee: string;
  client: string;
}) {
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
      <Link
        to="/missions/$missionId"
        params={{ missionId: mission.id }}
        className="surface-card block p-3 transition-shadow hover:shadow-[var(--shadow-elevated)]"
      >
        <PriorityBadge priority={mission.priority} />
        <p className="mt-2 text-sm font-semibold leading-snug">{mission.title}</p>
        <p className="mt-1 text-xs text-muted-foreground">{client}</p>
        <div className="mt-3 flex items-center justify-between border-t border-border pt-2 text-[11px] text-muted-foreground">
          <span className="truncate">{assignee}</span>
          <span>{new Date(mission.deadline).toLocaleDateString("fr-FR")}</span>
        </div>
      </Link>
    </motion.div>
  );
}
