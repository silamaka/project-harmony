import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, FolderKanban, ListChecks, Package } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/app-shell";
import { MissionStatusBadge, ProjectStatusBadge } from "@/components/shared/badges";
import { StatCard } from "@/components/shared/stat-card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useAuth } from "@/context/auth-context";
import { clientService, deliverableService, missionService, projectService } from "@/services";
import type { Deliverable } from "@/types";

export const Route = createFileRoute("/portail")({
  head: () => ({
    meta: [
      { title: "Portail client — BEBA EMPIRE" },
      {
        name: "description",
        content:
          "Suivez l'avancement de vos projets, missions et livrables validés avec BEBA EMPIRE.",
      },
      { property: "og:title", content: "Portail client — BEBA EMPIRE" },
      { property: "og:description", content: "Espace client : projets, missions et livrables." },
    ],
  }),
  component: ClientPortalPage,
});

function ClientPortalPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: clients } = useQuery({ queryKey: ["clients"], queryFn: clientService.list });
  const { data: projects } = useQuery({ queryKey: ["projects"], queryFn: projectService.list });
  const { data: missions } = useQuery({ queryKey: ["missions"], queryFn: missionService.list });
  const { data: deliverables } = useQuery({
    queryKey: ["deliverables"],
    queryFn: deliverableService.list,
  });

  // Rattachement démo : le client connecté est associé au premier client actif.
  const client =
    clients?.find((c) => c.contacts.some((ct) => ct.email === user?.email)) ?? clients?.[0];

  const myProjects = (projects ?? []).filter((p) => p.client_id === client?.id);
  const myMissions = (missions ?? []).filter((m) => m.client_id === client?.id);
  const myMissionIds = new Set(myMissions.map((m) => m.id));
  const myDeliverables = (deliverables ?? []).filter((d) => myMissionIds.has(d.mission_id));
  const validated = myDeliverables.filter((d) => d.status === "valide").length;

  const reviewMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: Deliverable["status"] }) =>
      deliverableService.updateStatus(id, status),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["deliverables"] });
      toast.success(
        variables.status === "valide"
          ? "Livrable validé, merci !"
          : "Demande de corrections envoyée à l'agence.",
      );
    },
  });

  return (
    <AppShell title="Portail client" subtitle={client?.name} allow={["client"]}>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Projets" value={myProjects.length} icon={FolderKanban} />
        <StatCard label="Missions" value={myMissions.length} icon={ListChecks} delay={0.05} />
        <StatCard label="Livrables" value={myDeliverables.length} icon={Package} delay={0.1} />
        <StatCard
          label="Livrables validés"
          value={validated}
          icon={CheckCircle2}
          tone="success"
          delay={0.15}
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="surface-card p-5">
          <h2 className="text-sm font-semibold">Vos projets</h2>
          <div className="mt-4 space-y-4">
            {myProjects.map((p) => (
              <div key={p.id}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{p.name}</span>
                  <ProjectStatusBadge status={p.status} />
                  <span className="text-xs font-semibold">{p.progress}%</span>
                </div>
                <Progress value={p.progress} className="mt-2 h-2" />
              </div>
            ))}
            {myProjects.length === 0 && (
              <p className="text-xs text-muted-foreground">Aucun projet en cours.</p>
            )}
          </div>
        </div>

        <div className="surface-card p-5">
          <h2 className="text-sm font-semibold">Missions en cours</h2>
          <div className="mt-4 space-y-2">
            {myMissions.slice(0, 8).map((m) => (
              <div
                key={m.id}
                className="flex flex-wrap items-center gap-3 rounded-lg border border-border px-3 py-2"
              >
                <span className="min-w-0 flex-1 truncate text-sm">{m.title}</span>
                <MissionStatusBadge status={m.status} />
              </div>
            ))}
            {myMissions.length === 0 && (
              <p className="text-xs text-muted-foreground">Aucune mission.</p>
            )}
          </div>
        </div>
      </div>

      <div className="surface-card mt-4 p-5">
        <h2 className="text-sm font-semibold">Livrables à valider</h2>
        <div className="mt-4 space-y-2">
          {myDeliverables
            .filter((d) => d.status !== "valide")
            .map((d) => (
              <div
                key={d.id}
                className="flex flex-wrap items-center gap-3 rounded-lg border border-border px-4 py-3 text-sm"
              >
                <span className="min-w-0 flex-1 truncate font-medium">{d.name}</span>
                <span className="text-xs text-muted-foreground">v{d.version}</span>
                <span className="text-xs text-muted-foreground">
                  {new Date(d.created_at).toLocaleDateString("fr-FR")}
                </span>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    disabled={reviewMutation.isPending}
                    onClick={() => reviewMutation.mutate({ id: d.id, status: "valide" })}
                  >
                    Valider
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={d.status === "corrections" || reviewMutation.isPending}
                    onClick={() => reviewMutation.mutate({ id: d.id, status: "corrections" })}
                  >
                    Demander des corrections
                  </Button>
                </div>
              </div>
            ))}
          {myDeliverables.filter((d) => d.status !== "valide").length === 0 && (
            <p className="text-xs text-muted-foreground">Tous vos livrables sont validés.</p>
          )}
        </div>
      </div>
    </AppShell>
  );
}
