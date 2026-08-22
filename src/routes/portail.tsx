import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCircle2, Eye, FolderKanban, ListChecks, Package } from "lucide-react";
import { useRef, type RefObject } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/app-shell";
import { MissionStatusBadge, ProjectStatusBadge } from "@/components/shared/badges";
import { StatCard } from "@/components/shared/stat-card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useAuth } from "@/context/auth-context";
import { clientService, deliverableService, missionService, projectService } from "@/services";
import { cn } from "@/lib/utils";
import type { Deliverable } from "@/types";

const DELIVERABLE_STATUS_TONE: Record<Deliverable["status"], string> = {
  en_attente: "bg-warning/20 text-warning",
  valide: "bg-success/15 text-success",
  corrections: "bg-destructive/12 text-destructive",
};

const DELIVERABLE_STATUS_LABEL: Record<Deliverable["status"], string> = {
  en_attente: "En attente",
  valide: "Validé",
  corrections: "Corrections",
};

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

  const projectsRef = useRef<HTMLDivElement>(null);
  const missionsRef = useRef<HTMLDivElement>(null);
  const deliverablesRef = useRef<HTMLDivElement>(null);
  const scrollTo = (ref: RefObject<HTMLDivElement | null>) =>
    ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });

  const client = clients?.find((c) => c.id === user?.client_id);

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

  if (clients !== undefined && !client) {
    return (
      <AppShell title="Portail client" allow={["client"]}>
        <div className="surface-card p-8 text-center">
          <h2 className="text-sm font-semibold">Aucune entreprise associée à votre compte</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Contactez votre chef de projet pour rattacher votre compte à votre entreprise.
          </p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Portail client" subtitle={client?.name} allow={["client"]}>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Projets"
          value={myProjects.length}
          icon={FolderKanban}
          onClick={() => scrollTo(projectsRef)}
        />
        <StatCard
          label="Missions"
          value={myMissions.length}
          icon={ListChecks}
          delay={0.05}
          onClick={() => scrollTo(missionsRef)}
        />
        <StatCard
          label="Livrables"
          value={myDeliverables.length}
          icon={Package}
          delay={0.1}
          onClick={() => scrollTo(deliverablesRef)}
        />
        <StatCard
          label="Livrables validés"
          value={validated}
          icon={CheckCircle2}
          tone="success"
          delay={0.15}
          onClick={() => scrollTo(deliverablesRef)}
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div ref={projectsRef} className="surface-card scroll-mt-20 p-5">
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

        <div ref={missionsRef} className="surface-card scroll-mt-20 p-5">
          <h2 className="text-sm font-semibold">Missions en cours</h2>
          <div className="mt-4 space-y-2">
            {myMissions.slice(0, 8).map((m) => (
              <Link
                key={m.id}
                to="/missions/$missionId"
                params={{ missionId: m.id }}
                className="flex flex-wrap items-center gap-3 rounded-lg border border-border px-3 py-2 transition-colors hover:border-primary/50 hover:bg-accent/20"
              >
                <span className="min-w-0 flex-1 truncate text-sm">{m.title}</span>
                <MissionStatusBadge status={m.status} />
              </Link>
            ))}
            {myMissions.length === 0 && (
              <p className="text-xs text-muted-foreground">Aucune mission.</p>
            )}
          </div>
        </div>
      </div>

      <div ref={deliverablesRef} className="surface-card mt-4 scroll-mt-20 p-5">
        <h2 className="text-sm font-semibold">Livrables</h2>
        <div className="mt-4 space-y-2">
          {[...myDeliverables]
            .sort((a, b) => Number(a.status === "valide") - Number(b.status === "valide"))
            .map((d) => (
              <div
                key={d.id}
                className="flex flex-wrap items-center gap-3 rounded-lg border border-border px-4 py-3 text-sm"
              >
                <span className="min-w-0 flex-1 truncate font-medium">{d.name}</span>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold",
                    DELIVERABLE_STATUS_TONE[d.status],
                  )}
                >
                  {DELIVERABLE_STATUS_LABEL[d.status]}
                </span>
                <span className="text-xs text-muted-foreground">v{d.version}</span>
                <span className="text-xs text-muted-foreground">
                  {new Date(d.created_at).toLocaleDateString("fr-FR")}
                </span>
                <a
                  href={d.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                >
                  <Eye className="h-3.5 w-3.5" /> Ouvrir
                </a>
                {d.status !== "valide" && (
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
                )}
              </div>
            ))}
          {myDeliverables.length === 0 && (
            <p className="text-xs text-muted-foreground">Aucun livrable pour le moment.</p>
          )}
        </div>
      </div>
    </AppShell>
  );
}
