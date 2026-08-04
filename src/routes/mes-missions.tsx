import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CalendarDays } from "lucide-react";
import { useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { MissionStatusBadge, PriorityBadge } from "@/components/shared/badges";
import { useAuth } from "@/context/auth-context";
import { clientService, isLate, missionService, projectService } from "@/services";
import { MISSION_STATUS_LABELS, MISSION_WORKFLOW, type MissionStatus } from "@/types";
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

function MyMissionsPage() {
  const { user } = useAuth();
  const [filter, setFilter] = useState<MissionStatus | "all">("all");

  const { data: missions } = useQuery({
    queryKey: ["missions", "assignee", user?.id],
    queryFn: () => missionService.byAssignee(user!.id),
    enabled: !!user,
  });
  const { data: projects } = useQuery({ queryKey: ["projects"], queryFn: projectService.list });
  const { data: clients } = useQuery({ queryKey: ["clients"], queryFn: clientService.list });

  const list = (missions ?? []).filter((m) => filter === "all" || m.status === filter);

  return (
    <AppShell
      title="Mes missions"
      subtitle={`${missions?.length ?? 0} mission(s) assignée(s)`}
      allow={["collaborateur"]}
    >
      <div className="flex flex-wrap gap-2">
        {(["all", ...MISSION_WORKFLOW] as const).map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
              filter === s
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border text-muted-foreground hover:bg-accent/50",
            )}
          >
            {s === "all" ? "Toutes" : MISSION_STATUS_LABELS[s]}
          </button>
        ))}
      </div>

      <div className="mt-5 space-y-3">
        {list.map((m) => {
          const project = projects?.find((p) => p.id === m.project_id);
          const client = clients?.find((c) => c.id === m.client_id);
          return (
            <Link
              key={m.id}
              to="/missions/$missionId"
              params={{ missionId: m.id }}
              className="surface-card block p-4 transition-colors hover:bg-accent/30"
            >
              <div className="flex flex-wrap items-center gap-3">
                <span className="min-w-0 flex-1 truncate text-sm font-semibold">{m.title}</span>
                <PriorityBadge priority={m.priority} />
                <MissionStatusBadge status={m.status} />
              </div>
              <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{m.description}</p>
              <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                <span>{client?.name}</span>
                <span>•</span>
                <span>{project?.name}</span>
                <span
                  className={cn(
                    "ml-auto inline-flex items-center gap-1.5 font-medium",
                    isLate(m) && "text-destructive",
                  )}
                >
                  <CalendarDays className="h-3.5 w-3.5" />
                  {new Date(m.deadline).toLocaleDateString("fr-FR")}
                </span>
              </div>
            </Link>
          );
        })}
        {list.length === 0 && (
          <p className="text-sm text-muted-foreground">Aucune mission pour ce filtre.</p>
        )}
      </div>
    </AppShell>
  );
}
