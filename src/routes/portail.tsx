import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertTriangle, CalendarDays, FolderKanban, ListChecks } from "lucide-react";
import { useRef, useState, type RefObject } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { MissionStatusBadge, ProjectStatusBadge } from "@/components/shared/badges";
import { StatCard } from "@/components/shared/stat-card";
import { Progress } from "@/components/ui/progress";
import { useAuth } from "@/context/auth-context";
import { clientService, isLate, missionService, projectService } from "@/services";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/portail")({
  head: () => ({
    meta: [
      { title: "Portail client — BEBA EMPIRE" },
      {
        name: "description",
        content: "Suivez l'avancement de vos projets et missions avec BEBA EMPIRE.",
      },
      { property: "og:title", content: "Portail client — BEBA EMPIRE" },
      { property: "og:description", content: "Espace client : projets et missions." },
    ],
  }),
  component: ClientPortalPage,
});

function ClientPortalPage() {
  const { user } = useAuth();
  const { data: clients } = useQuery({ queryKey: ["clients"], queryFn: clientService.list });
  const { data: projects } = useQuery({ queryKey: ["projects"], queryFn: projectService.list });
  const { data: missions } = useQuery({ queryKey: ["missions"], queryFn: missionService.list });

  const projectsRef = useRef<HTMLDivElement>(null);
  const missionsRef = useRef<HTMLDivElement>(null);
  const [highlighted, setHighlighted] = useState<"projects" | "missions" | null>(null);
  const scrollTo = (ref: RefObject<HTMLDivElement | null>, key: "projects" | "missions") => {
    ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    setHighlighted(key);
    window.setTimeout(() => setHighlighted((current) => (current === key ? null : current)), 1200);
  };

  const [projectFilter, setProjectFilter] = useState<string | null>(null);
  const selectProject = (projectId: string) => {
    setProjectFilter((current) => (current === projectId ? null : projectId));
    scrollTo(missionsRef, "missions");
  };

  const client = clients?.find((c) => c.id === user?.client_id);

  const myProjects = (projects ?? []).filter((p) => p.client_id === client?.id);
  const myMissions = (missions ?? [])
    .filter((m) => m.client_id === client?.id)
    .sort((a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime());
  const visibleMissions = projectFilter
    ? myMissions.filter((m) => m.project_id === projectFilter)
    : myMissions;
  const filteredProjectName = myProjects.find((p) => p.id === projectFilter)?.name;

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
      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard
          label="Projets"
          value={myProjects.length}
          icon={FolderKanban}
          onClick={() => scrollTo(projectsRef, "projects")}
        />
        <StatCard
          label="Missions"
          value={myMissions.length}
          icon={ListChecks}
          delay={0.05}
          onClick={() => scrollTo(missionsRef, "missions")}
        />
      </div>

      <div className="mt-4 grid items-start gap-4 lg:grid-cols-2">
        <div
          ref={projectsRef}
          className={cn(
            "surface-card scroll-mt-20 p-5 transition-shadow duration-300",
            highlighted === "projects" &&
              "ring-2 ring-primary ring-offset-2 ring-offset-background",
          )}
        >
          <h2 className="text-sm font-semibold">Vos projets</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Cliquez sur un projet pour voir ses missions.
          </p>
          <div className="mt-4 space-y-3">
            {myProjects.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => selectProject(p.id)}
                aria-pressed={projectFilter === p.id}
                className={cn(
                  "w-full rounded-lg border p-2.5 text-left transition-colors",
                  projectFilter === p.id
                    ? "border-primary/60 bg-primary/5"
                    : "border-transparent hover:border-border hover:bg-accent/20",
                )}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{p.name}</span>
                  <ProjectStatusBadge status={p.status} />
                  <span className="text-xs font-semibold">{p.progress}%</span>
                </div>
                <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <CalendarDays className="h-3.5 w-3.5 shrink-0" />
                  {new Date(p.start_date).toLocaleDateString("fr-FR")} →{" "}
                  {new Date(p.end_date).toLocaleDateString("fr-FR")}
                </p>
                <Progress value={p.progress} className="mt-2 h-2" />
              </button>
            ))}
            {myProjects.length === 0 && (
              <p className="text-xs text-muted-foreground">Aucun projet en cours.</p>
            )}
          </div>
        </div>

        <div
          ref={missionsRef}
          className={cn(
            "surface-card scroll-mt-20 p-5 transition-shadow duration-300",
            highlighted === "missions" &&
              "ring-2 ring-primary ring-offset-2 ring-offset-background",
          )}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">
              {filteredProjectName ? `Missions — ${filteredProjectName}` : "Missions en cours"}
            </h2>
            {projectFilter && (
              <button
                type="button"
                onClick={() => setProjectFilter(null)}
                className="text-xs font-medium text-primary hover:underline"
              >
                Voir toutes les missions
              </button>
            )}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Triées par échéance la plus proche.</p>
          <div className="mt-4 space-y-2">
            {visibleMissions.slice(0, 8).map((m) => {
              const late = isLate(m);
              return (
                <Link
                  key={m.id}
                  to="/missions/$missionId"
                  params={{ missionId: m.id }}
                  className="flex flex-wrap items-center gap-3 rounded-lg border border-border px-3 py-2 transition-colors hover:border-primary/50 hover:bg-accent/20"
                >
                  <span className="min-w-0 flex-1 truncate text-sm">{m.title}</span>
                  <span
                    className={cn(
                      "flex shrink-0 items-center gap-1 text-xs",
                      late ? "font-semibold text-destructive" : "text-muted-foreground",
                    )}
                  >
                    {late && <AlertTriangle className="h-3.5 w-3.5" />}
                    {new Date(m.deadline).toLocaleDateString("fr-FR")}
                  </span>
                  <MissionStatusBadge status={m.status} />
                </Link>
              );
            })}
            {visibleMissions.length === 0 && (
              <p className="text-xs text-muted-foreground">
                {projectFilter ? "Aucune mission sur ce projet." : "Aucune mission."}
              </p>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
