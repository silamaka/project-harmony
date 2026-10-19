import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertTriangle, CalendarDays, Eye, FolderKanban, ListChecks, Package } from "lucide-react";
import { useRef, useState, type RefObject } from "react";
import { AppShell } from "@/components/layout/app-shell";
import {
  ClientMissionStatusBadge,
  DeliverableStateBadge,
  ProjectStatusBadge,
  deliverableBorderTone,
  deliverableState,
  hasDeliverableLink,
} from "@/components/shared/badges";
import { DeliverableDecision } from "@/components/shared/deliverable-decision";
import { StatCard } from "@/components/shared/stat-card";
import { Progress } from "@/components/ui/progress";
import { useAuth } from "@/context/auth-context";
import {
  clientService,
  deliverableService,
  isLate,
  isMissionDone,
  isProjectLate,
  missionService,
  projectService,
} from "@/services";
import { cn } from "@/lib/utils";
import type { Deliverable, Mission } from "@/types";

export const Route = createFileRoute("/portail")({
  head: () => ({
    meta: [
      { title: "Portail client — OLYMPE" },
      {
        name: "description",
        content: "Suivez l'avancement de vos projets, missions et livrables avec BEBA EMPIRE.",
      },
      { property: "og:title", content: "Portail client — OLYMPE" },
      { property: "og:description", content: "Espace client : projets, missions et livrables." },
    ],
  }),
  component: ClientPortalPage,
});

type Section = "projects" | "missions" | "deliverables";

const formatDate = (iso: string) => new Date(iso).toLocaleDateString("fr-FR");

/** Un livrable de l'agence qui attend la décision du client. Le backend ne
 * renvoie au client que les livrables envoyés (mission "Envoyé au client"
 * ou plus loin, avec un lien) et ses propres dépôts. */
const awaitsDecision = (d: Deliverable, userId: string | undefined) =>
  d.uploaded_by !== userId && deliverableState(d) === "en_attente";

function ClientPortalPage() {
  const { user } = useAuth();
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
  const [highlighted, setHighlighted] = useState<Section | null>(null);
  const scrollTo = (ref: RefObject<HTMLDivElement | null>, key: Section) => {
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
  // Missions à suivre d'abord (échéance la plus proche en tête), puis les
  // missions closes (Validé / Publié / Terminé) en bas.
  const myMissions = (missions ?? [])
    .filter((m) => m.client_id === client?.id)
    .sort(
      (a, b) =>
        Number(isMissionDone(a.status)) - Number(isMissionDone(b.status)) ||
        new Date(a.deadline).getTime() - new Date(b.deadline).getTime(),
    );
  const missionById = new Map<string, Mission>(myMissions.map((m) => [m.id, m]));
  const myDeliverables = (deliverables ?? [])
    .filter((d) => missionById.has(d.mission_id))
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  const toReview = myDeliverables.filter((d) => awaitsDecision(d, user?.id));

  const inProject = (missionId: string) =>
    !projectFilter || missionById.get(missionId)?.project_id === projectFilter;
  const visibleMissions = myMissions.filter((m) => inProject(m.id));
  const visibleDeliverables = myDeliverables.filter((d) => inProject(d.mission_id));
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
      <div className="grid gap-4 sm:grid-cols-3">
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
        <StatCard
          label="Livrables"
          value={myDeliverables.length}
          icon={Package}
          delay={0.1}
          tone={toReview.length > 0 ? "warning" : "default"}
          hint={toReview.length > 0 ? `${toReview.length} à valider` : "Rien à valider"}
          onClick={() => scrollTo(deliverablesRef, "deliverables")}
        />
      </div>

      {toReview.length > 0 && (
        <div className="surface-card mt-4 border-2 border-warning/40 bg-warning/5 p-5">
          <p className="text-xs font-bold tracking-wide text-warning uppercase">
            À vous de jouer — {toReview.length} livrable{toReview.length > 1 ? "s" : ""} à valider
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Ouvrez chaque livrable, puis validez-le ou demandez des corrections.
          </p>
          <ul className="mt-4 space-y-2">
            {toReview.map((d) => (
              <li
                key={d.id}
                className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-background px-3 py-2.5"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{d.name}</p>
                  <MissionLink mission={missionById.get(d.mission_id)} />
                </div>
                <a
                  href={d.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                >
                  <Eye className="h-4 w-4" /> Ouvrir
                </a>
                <DeliverableDecision deliverable={d} />
              </li>
            ))}
          </ul>
        </div>
      )}

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
            Cliquez sur un projet pour voir ses missions et ses livrables.
          </p>
          <div className="mt-4 space-y-3">
            {myProjects.map((p) => {
              const late = isProjectLate(p);
              return (
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
                  <p
                    className={cn(
                      "mt-1 flex items-center gap-1.5 text-xs",
                      late ? "font-semibold text-destructive" : "text-muted-foreground",
                    )}
                  >
                    {late ? (
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                    ) : (
                      <CalendarDays className="h-3.5 w-3.5 shrink-0" />
                    )}
                    {formatDate(p.start_date)} → {formatDate(p.end_date)}
                  </p>
                  <Progress value={p.progress} className="mt-2 h-2" />
                </button>
              );
            })}
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
          <h2 className="text-sm font-semibold">
            {filteredProjectName ? `Missions — ${filteredProjectName}` : "Vos missions"}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {filteredProjectName
              ? "Recliquez sur le projet pour revenir à toutes les missions."
              : "Les missions à suivre d'abord, par échéance ; les missions terminées en bas."}
          </p>
          <div className="mt-4 max-h-[28rem] space-y-2 overflow-y-auto">
            {visibleMissions.map((m) => {
              const late = isLate(m);
              return (
                <Link
                  key={m.id}
                  to="/missions/$missionId"
                  params={{ missionId: m.id }}
                  className={cn(
                    "flex flex-wrap items-center gap-3 rounded-lg border border-border px-3 py-2 transition-colors hover:border-primary/50 hover:bg-accent/20",
                    isMissionDone(m.status) && "opacity-70",
                  )}
                >
                  <span className="min-w-0 flex-1 truncate text-sm">{m.title}</span>
                  <span
                    className={cn(
                      "flex shrink-0 items-center gap-1 text-xs",
                      late ? "font-semibold text-destructive" : "text-muted-foreground",
                    )}
                  >
                    {late && <AlertTriangle className="h-3.5 w-3.5" />}
                    {formatDate(m.deadline)}
                  </span>
                  <ClientMissionStatusBadge status={m.status} />
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

      <div
        ref={deliverablesRef}
        className={cn(
          "surface-card mt-4 scroll-mt-20 p-5 transition-shadow duration-300",
          highlighted === "deliverables" &&
            "ring-2 ring-primary ring-offset-2 ring-offset-background",
        )}
      >
        <h2 className="text-sm font-semibold">
          {filteredProjectName ? `Livrables — ${filteredProjectName}` : "Vos livrables"}
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Tout ce que l'équipe vous a envoyé, du plus récent au plus ancien.
        </p>
        <ul className="mt-4 space-y-2">
          {visibleDeliverables.map((d) => (
            <li
              key={d.id}
              className={cn(
                "flex flex-wrap items-center gap-3 rounded-lg border border-l-4 border-border px-3 py-2.5",
                deliverableBorderTone[deliverableState(d)],
              )}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{d.name}</p>
                <MissionLink mission={missionById.get(d.mission_id)} />
              </div>
              <DeliverableStateBadge deliverable={d} audience="client" />
              {hasDeliverableLink(d) && (
                <a
                  href={d.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                >
                  <Eye className="h-4 w-4" /> Ouvrir
                </a>
              )}
            </li>
          ))}
          {visibleDeliverables.length === 0 && (
            <li className="text-xs text-muted-foreground">
              {projectFilter
                ? "Aucun livrable sur ce projet pour le moment."
                : "Aucun livrable pour le moment : ils apparaîtront ici dès que l'équipe vous les enverra."}
            </li>
          )}
        </ul>
      </div>
    </AppShell>
  );
}

function MissionLink({ mission }: { mission: Mission | undefined }) {
  if (!mission) return null;
  return (
    <Link
      to="/missions/$missionId"
      params={{ missionId: mission.id }}
      className="text-xs text-muted-foreground hover:text-primary hover:underline"
    >
      Mission : {mission.title}
    </Link>
  );
}
