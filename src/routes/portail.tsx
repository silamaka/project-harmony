import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { differenceInCalendarDays } from "date-fns";
import { ChevronRight, Eye, FolderKanban, ListChecks, Package } from "lucide-react";
import { useState, type ReactNode } from "react";
import { AppShell } from "@/components/layout/app-shell";
import {
  ClientMissionStatusBadge,
  DeliverableStateBadge,
  ProjectStatusBadge,
  clientMissionStatus,
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
  isMissionDone,
  missionService,
  projectService,
} from "@/services";
import { cn } from "@/lib/utils";
import type { Deliverable, Mission, Project } from "@/types";

type View = "missions" | "livrables";

export const Route = createFileRoute("/portail")({
  // L'onglet vit dans l'URL (/portail?vue=livrables) : un lien direct ouvre
  // le bon onglet et le bouton Retour du navigateur fonctionne. Paramètre
  // facultatif : sans lui, l'onglet Missions s'affiche.
  validateSearch: (search: Record<string, unknown>): { vue?: "livrables" } =>
    search["vue"] === "livrables" ? { vue: "livrables" } : {},
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

const formatDate = (iso: string) => new Date(iso).toLocaleDateString("fr-FR");

/** Au-delà, un livrable qui attend la décision du client est signalé : c'est
 * le seul retard montré au client, parce que c'est lui qui bloque. Les
 * retards de l'agence (échéances dépassées) restent internes. */
const REVIEW_REMINDER_DAYS = 5;

/** Un livrable de l'agence qui attend la décision du client. Le backend ne
 * renvoie au client que les livrables envoyés (mission "Envoyé au client"
 * ou plus loin, avec un lien) et ses propres dépôts. */
const awaitsDecision = (d: Deliverable, userId: string | undefined) =>
  d.uploaded_by !== userId && deliverableState(d) === "en_attente";

type DeliverableFilter = "tous" | "a_valider" | "corrections" | "valides" | "publies";

function ClientPortalPage() {
  const { user } = useAuth();
  const navigate = useNavigate({ from: "/portail" });
  const { vue } = Route.useSearch();
  const view: View = vue === "livrables" ? "livrables" : "missions";
  const setView = (next: View) =>
    void navigate({ search: next === "livrables" ? { vue: "livrables" } : {} });

  const { data: clients } = useQuery({ queryKey: ["clients"], queryFn: clientService.list });
  const { data: projects } = useQuery({ queryKey: ["projects"], queryFn: projectService.list });
  const { data: missions } = useQuery({ queryKey: ["missions"], queryFn: missionService.list });
  const { data: deliverables } = useQuery({
    queryKey: ["deliverables"],
    queryFn: deliverableService.list,
  });

  const [projectFilter, setProjectFilter] = useState<string | null>(null);
  const [deliverableFilter, setDeliverableFilter] = useState<DeliverableFilter>("tous");

  const client = clients?.find((c) => c.id === user?.client_id);

  const myProjects = (projects ?? []).filter((p) => p.client_id === client?.id);
  const myMissions = (missions ?? [])
    .filter((m) => m.client_id === client?.id)
    .sort((a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime());
  const missionById = new Map<string, Mission>(myMissions.map((m) => [m.id, m]));
  const myDeliverables = (deliverables ?? [])
    .filter((d) => missionById.has(d.mission_id))
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  const toReview = myDeliverables.filter((d) => awaitsDecision(d, user?.id));

  // La plupart des clients n'ont qu'un projet : une simple ligne
  // d'avancement suffit. À partir de deux projets non archivés, un filtre
  // par projet apparaît au-dessus de la liste. Les missions / livrables d'un
  // projet archivé restent dans les listes : c'est l'historique du client.
  const currentProjects = myProjects.filter((p) => p.status !== "archive");
  const compact = currentProjects.length <= 1;
  const mainProject = currentProjects[0];

  const inProject = (missionId: string) =>
    !projectFilter || missionById.get(missionId)?.project_id === projectFilter;
  const visibleMissions = myMissions.filter((m) => inProject(m.id));
  const projectDeliverables = myDeliverables.filter((d) => inProject(d.mission_id));

  // Missions regroupées par ce qui concerne le client : d'abord ce qu'il doit
  // valider, puis ce qui avance chez nous, et les missions closes repliées.
  const missionGroups = {
    toValidate: visibleMissions.filter((m) => clientMissionStatus(m.status) === "a_valider"),
    inProgress: visibleMissions.filter(
      (m) => clientMissionStatus(m.status) !== "a_valider" && !isMissionDone(m.status),
    ),
    done: visibleMissions.filter((m) => isMissionDone(m.status)).reverse(), // la plus récente en premier
  };
  const openMissions = myMissions.filter((m) => !isMissionDone(m.status)).length;

  const deliverableMatches: Record<DeliverableFilter, (d: Deliverable) => boolean> = {
    tous: () => true,
    a_valider: (d) => awaitsDecision(d, user?.id),
    corrections: (d) => deliverableState(d) === "corrections",
    valides: (d) => deliverableState(d) === "pret",
    publies: (d) => deliverableState(d) === "publie",
  };
  const deliverableFilters: { key: DeliverableFilter; label: string; count: number }[] = (
    [
      ["tous", "Tous"],
      ["a_valider", "À valider"],
      ["corrections", "Corrections demandées"],
      ["valides", "Validés"],
      ["publies", "Publiés"],
    ] as const
  )
    .map(([key, label]) => ({
      key,
      label,
      count: projectDeliverables.filter(deliverableMatches[key]).length,
    }))
    // "Corrections" n'apparaît que s'il y en a : c'est l'exception.
    .filter((f) => f.key !== "corrections" || f.count > 0);
  const visibleDeliverables = projectDeliverables.filter(deliverableMatches[deliverableFilter]);

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
      {compact && mainProject && <ProjectStrip project={mainProject} />}

      {/* Les deux cartes servent d'onglets : la carte active est surlignée. */}
      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard
          label="Missions"
          value={myMissions.length}
          icon={ListChecks}
          hint={`${openMissions} en cours`}
          active={view === "missions"}
          onClick={() => setView("missions")}
        />
        <StatCard
          label="Livrables"
          value={myDeliverables.length}
          icon={Package}
          delay={0.05}
          tone={toReview.length > 0 ? "warning" : "default"}
          hint={toReview.length > 0 ? `${toReview.length} à valider` : "Rien à valider"}
          active={view === "livrables"}
          onClick={() => setView("livrables")}
        />
      </div>

      {/* L'action attendue du client reste visible quel que soit l'onglet. */}
      {toReview.length > 0 && (
        <div className="surface-card mt-4 border-2 border-warning/40 bg-warning/5 p-5">
          <p className="text-xs font-bold tracking-wide text-warning uppercase">
            À vous de jouer — {toReview.length} livrable{toReview.length > 1 ? "s" : ""} à valider
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Ouvrez chaque livrable, puis validez-le ou demandez des corrections.
          </p>
          <ul className="mt-4 space-y-2">
            {toReview.map((d) => {
              const waitingDays = differenceInCalendarDays(new Date(), new Date(d.created_at));
              return (
                <li
                  key={d.id}
                  className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-background px-3 py-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{d.name}</p>
                    <MissionLink mission={missionById.get(d.mission_id)} />
                    <p
                      className={cn(
                        "text-[11px]",
                        waitingDays >= REVIEW_REMINDER_DAYS
                          ? "font-semibold text-warning"
                          : "text-muted-foreground",
                      )}
                    >
                      Envoyé le {formatDate(d.created_at)}
                      {waitingDays >= REVIEW_REMINDER_DAYS &&
                        ` · en attente de votre retour depuis ${waitingDays} jours`}
                    </p>
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
              );
            })}
          </ul>
        </div>
      )}

      <div className="surface-card mt-4 p-5">
        {!compact && (
          <ProjectFilter projects={myProjects} value={projectFilter} onChange={setProjectFilter} />
        )}

        {view === "missions" ? (
          <>
            <h2 className="text-sm font-semibold">Vos missions</h2>
            {visibleMissions.length === 0 && (
              <p className="mt-4 text-xs text-muted-foreground">
                {projectFilter ? "Aucune mission sur ce projet." : "Aucune mission."}
              </p>
            )}
            <MissionGroup
              title="À valider"
              hint="L'équipe attend votre retour."
              tone="warning"
              missions={missionGroups.toValidate}
            />
            <MissionGroup
              title="En cours"
              hint="L'équipe y travaille."
              missions={missionGroups.inProgress}
            />
            {missionGroups.done.length > 0 && (
              <details className="group mt-5">
                <summary className="flex cursor-pointer list-none items-center gap-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase select-none">
                  <ChevronRight className="h-3.5 w-3.5 transition-transform group-open:rotate-90" />
                  Terminées ({missionGroups.done.length})
                </summary>
                <MissionList missions={missionGroups.done} muted />
              </details>
            )}
          </>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold">Vos livrables</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Tout ce que l'équipe vous a envoyé, du plus récent au plus ancien.
                </p>
              </div>
              <div className="flex flex-wrap gap-1 rounded-lg border border-border p-1">
                {deliverableFilters.map((f) => (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => setDeliverableFilter(f.key)}
                    className={cn(
                      "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                      deliverableFilter === f.key
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-accent",
                    )}
                  >
                    {f.label} ({f.count})
                  </button>
                ))}
              </div>
            </div>
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
                  <span className="text-xs text-muted-foreground">
                    Envoyé le {formatDate(d.created_at)}
                  </span>
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
                <li className="py-6 text-center text-xs text-muted-foreground">
                  {myDeliverables.length === 0
                    ? "Aucun livrable pour le moment : ils apparaîtront ici dès que l'équipe vous les enverra."
                    : "Aucun livrable pour ce filtre."}
                </li>
              )}
            </ul>
          </>
        )}
      </div>
    </AppShell>
  );
}

/** Avancement du projet unique du client, en une ligne. */
function ProjectStrip({ project }: { project: Project }) {
  return (
    <div className="surface-card mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3">
      <span className="flex items-center gap-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        <FolderKanban className="h-4 w-4 text-primary" /> Projet
      </span>
      <span className="min-w-0 truncate text-sm font-semibold">{project.name}</span>
      <ProjectStatusBadge status={project.status} />
      <div className="flex min-w-40 flex-1 items-center gap-3">
        <Progress value={project.progress} className="h-2 flex-1" />
        <span className="text-xs font-semibold">{project.progress}%</span>
      </div>
    </div>
  );
}

/** Filtre par projet (au moins deux projets non archivés), avec l'avancement
 * de chacun. */
function ProjectFilter({
  projects,
  value,
  onChange,
}: {
  projects: Project[];
  value: string | null;
  onChange: (projectId: string | null) => void;
}) {
  const chip = (active: boolean) =>
    cn(
      "flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
      active
        ? "border-primary bg-primary/10 text-primary"
        : "border-border text-muted-foreground hover:border-primary/40",
    );
  return (
    <div className="mb-5 flex flex-wrap items-center gap-2 border-b border-border pb-4">
      <FolderKanban className="h-4 w-4 text-primary" />
      <button type="button" className={chip(value === null)} onClick={() => onChange(null)}>
        Tous les projets
      </button>
      {projects.map((p) => (
        <button
          key={p.id}
          type="button"
          className={chip(value === p.id)}
          onClick={() => onChange(value === p.id ? null : p.id)}
        >
          {p.name}
          <span className="opacity-70">
            {p.status === "archive" ? "archivé" : `${p.progress}%`}
          </span>
        </button>
      ))}
    </div>
  );
}

function MissionGroup({
  title,
  hint,
  tone = "default",
  missions,
}: {
  title: string;
  hint: string;
  tone?: "default" | "warning";
  missions: Mission[];
}): ReactNode {
  if (missions.length === 0) return null;
  return (
    <div className="mt-5">
      <p
        className={cn(
          "text-xs font-semibold tracking-wide uppercase",
          tone === "warning" ? "text-warning" : "text-muted-foreground",
        )}
      >
        {title} ({missions.length})
        <span className="ml-2 font-normal tracking-normal normal-case">{hint}</span>
      </p>
      <MissionList missions={missions} />
    </div>
  );
}

/** Échéance affichée comme une date prévue, jamais comme un retard : un
 * dépassement d'échéance côté agence reste une information interne. */
function MissionList({ missions, muted = false }: { missions: Mission[]; muted?: boolean }) {
  return (
    <div className="mt-2 space-y-2">
      {missions.map((m) => (
        <Link
          key={m.id}
          to="/missions/$missionId"
          params={{ missionId: m.id }}
          className={cn(
            "flex flex-wrap items-center gap-3 rounded-lg border border-border px-3 py-2 transition-colors hover:border-primary/50 hover:bg-accent/20",
            muted && "opacity-70",
          )}
        >
          <span className="min-w-0 flex-1 truncate text-sm">{m.title}</span>
          <span className="shrink-0 text-xs text-muted-foreground">
            {isMissionDone(m.status) ? "Échéance" : "Prévu pour le"} {formatDate(m.deadline)}
          </span>
          <ClientMissionStatusBadge status={m.status} />
        </Link>
      ))}
    </div>
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
