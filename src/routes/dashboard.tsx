import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  endOfDay,
  endOfMonth,
  endOfQuarter,
  endOfWeek,
  endOfYear,
  format,
  isWithinInterval,
  startOfDay,
  startOfMonth,
  startOfQuarter,
  startOfWeek,
  startOfYear,
} from "date-fns";
import { fr } from "date-fns/locale";
import {
  AlertTriangle,
  Building2,
  CalendarCheck,
  CalendarClock,
  CalendarDays,
  Clock,
  FolderKanban,
  ListChecks,
  Package,
  Users,
} from "lucide-react";
import type { DateRange } from "react-day-picker";
import { toast } from "sonner";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AppShell } from "@/components/layout/app-shell";
import { StatCard } from "@/components/shared/stat-card";
import { ObliqueNameTick } from "@/components/shared/oblique-name-tick";
import { useIsMobile } from "@/hooks/use-mobile";
import { ContentQuotaChart } from "@/components/shared/content-quota-chart";
import { DeliverableStateBadge } from "@/components/shared/badges";
import { ScheduledLine } from "@/components/shared/deliverable-schedule";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ConfirmDeleteButton, EditMissionDialog } from "@/components/shared/edit-dialogs";
import { MissionsTable } from "@/components/shared/missions-table";
import { usePersistedState } from "@/hooks/use-persisted-state";
import { cn } from "@/lib/utils";
import {
  clientService,
  commentService,
  dashboardService,
  deliverableService,
  isLate,
  missionService,
  projectService,
  userService,
} from "@/services";
import type { Mission, MissionStatus, Priority } from "@/types";
import { errorMessage } from "@/lib/api";

const PERIODS = ["tout", "jour", "semaine", "mois", "trimestre", "annee", "personnalise"] as const;
type Period = (typeof PERIODS)[number];
const PERIOD_LABELS: Record<Period, string> = {
  tout: "Tout",
  jour: "Aujourd'hui",
  semaine: "Cette semaine",
  mois: "Ce mois-ci",
  trimestre: "Ce trimestre",
  annee: "Cette année",
  personnalise: "Personnalisé",
};

/** Axe X des graphiques par nom : noms en oblique, comme « Contenus du mois ». */
const obliqueAxisProps = (isMobile: boolean) => ({
  interval: 0 as const,
  height: isMobile ? 96 : 72,
  tickLine: false,
  tick: <ObliqueNameTick angle={isMobile ? -60 : -35} />,
});

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — OLYMPE" },
      { name: "description", content: "KPIs, graphiques et alertes de l'agence en temps réel." },
      { property: "og:title", content: "Dashboard — OLYMPE" },
      { property: "og:description", content: "Pilotage global de l'activité de l'agence." },
    ],
  }),
  component: DashboardPage,
});

function DashboardPage() {
  const { data: alerts } = useQuery({
    queryKey: ["dashboard", "alerts"],
    queryFn: dashboardService.alerts,
  });
  const { data: missions } = useQuery({ queryKey: ["missions"], queryFn: missionService.list });
  const { data: clients } = useQuery({ queryKey: ["clients"], queryFn: clientService.list });
  const { data: projects } = useQuery({ queryKey: ["projects"], queryFn: projectService.list });
  const { data: users } = useQuery({ queryKey: ["users"], queryFn: userService.list });
  const { data: deliverables } = useQuery({
    queryKey: ["deliverables"],
    queryFn: deliverableService.list,
  });
  const { data: comments } = useQuery({ queryKey: ["comments"], queryFn: commentService.list });

  const qc = useQueryClient();
  const isMobile = useIsMobile();
  const [drill, setDrill] = useState<null | string>(null);
  const [editingMission, setEditingMission] = useState<Mission | null>(null);
  const [deletingMission, setDeletingMission] = useState<Mission | null>(null);
  const [period, setPeriod] = usePersistedState<Period>("beba.dashboard-period", "tout");
  const [customStart, setCustomStart] = usePersistedState("beba.dashboard-custom-start", "");
  const [customEnd, setCustomEnd] = usePersistedState("beba.dashboard-custom-end", "");

  const range = useMemo(() => {
    const now = new Date();
    switch (period) {
      case "jour":
        return { start: startOfDay(now), end: endOfDay(now) };
      case "semaine":
        return {
          start: startOfWeek(now, { weekStartsOn: 1 }),
          end: endOfWeek(now, { weekStartsOn: 1 }),
        };
      case "mois":
        return { start: startOfMonth(now), end: endOfMonth(now) };
      case "trimestre":
        return { start: startOfQuarter(now), end: endOfQuarter(now) };
      case "annee":
        return { start: startOfYear(now), end: endOfYear(now) };
      case "personnalise": {
        if (!customStart || !customEnd) return null;
        const start = startOfDay(new Date(customStart));
        const end = endOfDay(new Date(customEnd));
        return start <= end ? { start, end } : null;
      }
      default:
        return null;
    }
  }, [period, customStart, customEnd]);

  const clientName = (id: string) => clients?.find((c) => c.id === id)?.name ?? "—";
  const userName = (id: string) => {
    const u = users?.find((x) => x.id === id);
    return u ? `${u.first_name} ${u.last_name}` : "—";
  };
  const missionTitle = (id: string) => missions?.find((m) => m.id === id)?.title ?? "—";

  const filteredMissions = useMemo(
    () =>
      (missions ?? []).filter((m) => {
        if (!range) return true;
        const start = new Date(m.start_date);
        const deadline = new Date(m.deadline);
        // Mission active pendant la période : sa plage [début, échéance]
        // chevauche l'intervalle sélectionné — couvre aussi bien "échéance
        // dans la période" que "en cours pendant la période" (ex. mission
        // du 1er au 30 janvier, toujours visible sous "Aujourd'hui" le 15).
        if (start <= range.end && deadline >= range.start) return true;
        // Une mission en retard et toujours ouverte reste à traiter sur la
        // période en cours même si son échéance est antérieure au début du
        // filtre (ex. "Aujourd'hui" doit aussi montrer ce qui aurait dû
        // être fait hier et ne l'a toujours pas été) : on ne veut pas
        // qu'un filtre de période la fasse disparaître du dashboard.
        return deadline < range.start && isLate(m);
      }),
    [missions, range],
  );
  const filteredDeliverables = useMemo(
    () =>
      (deliverables ?? []).filter((d) => !range || isWithinInterval(new Date(d.created_at), range)),
    [deliverables, range],
  );

  const collaborators = (users ?? []).filter((u) => u.role === "collaborateur");
  const lateMissions = filteredMissions.filter(isLate);

  const byClient = useMemo(
    () =>
      (clients ?? []).map((c) => ({
        name: c.name,
        missions: filteredMissions.filter((m) => m.client_id === c.id).length,
      })),
    [clients, filteredMissions],
  );
  const byCollab = useMemo(
    () =>
      collaborators.map((u) => ({
        name: `${u.first_name} ${u.last_name}`,
        missions: filteredMissions.filter(
          (m) => m.assignee_id === u.id || m.collaborators.includes(u.id),
        ).length,
      })),
    [collaborators, filteredMissions],
  );

  const stats = {
    clients: (clients ?? []).length,
    projects: (projects ?? []).length,
    missions: filteredMissions.length,
    collaborators: collaborators.length,
    deliverables: filteredDeliverables.length,
    late_missions: lateMissions.length,
  };

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
    onError: (error) => toast.error(errorMessage(error, "Mise à jour du statut impossible.")),
  });
  const updatePriority = useMutation({
    mutationFn: ({ id, priority }: { id: string; priority: Priority }) =>
      missionService.update(id, { priority }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["missions"] }),
    onError: (error) => toast.error(errorMessage(error, "Mise à jour de la priorité impossible.")),
  });
  const updateAssignee = useMutation({
    mutationFn: ({ id, assignee_id }: { id: string; assignee_id: string }) =>
      missionService.update(id, { assignee_id }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["missions"] }),
    onError: (error) => toast.error(errorMessage(error, "Réassignation impossible.")),
  });
  const removeMission = useMutation({
    mutationFn: (id: string) => missionService.remove(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["missions"] });
      toast.success("Mission supprimée.");
      setDeletingMission(null);
    },
    onError: (error) => toast.error(errorMessage(error, "Suppression impossible.")),
  });

  const drillMissions: Mission[] | null =
    drill === "missions"
      ? filteredMissions
      : drill === "late"
        ? lateMissions
        : drill === "in24h"
          ? (alerts?.in24h ?? [])
          : drill === "in48h"
            ? (alerts?.in48h ?? [])
            : drill === "blocked"
              ? (alerts?.blocked ?? [])
              : null;

  const publicationDrill =
    drill === "publicationsToday"
      ? {
          items: alerts?.publicationsToday ?? [],
          hint: "Toutes les publications prévues aujourd'hui, publiées ou non, par heure.",
          empty: "Aucune publication prévue aujourd'hui.",
        }
      : drill === "publicationsAtRisk"
        ? {
            items: alerts?.publicationsAtRisk ?? [],
            hint: "Prévues dans les 48 h sans être validées par l'agence et le client, ou date de publication dépassée.",
            empty: "Aucune publication à risque.",
          }
        : null;

  return (
    <AppShell
      title="Dashboard"
      subtitle="Vue d'ensemble de l'activité de l'agence"
      allow={["admin", "chef_projet", "collaborateur"]}
    >
      <div className="surface-card flex flex-wrap items-center gap-3 p-3">
        <div className="flex items-center gap-1.5 pl-1 text-sm font-semibold text-muted-foreground">
          <CalendarDays className="h-4 w-4" />
          Période
        </div>
        <div className="flex flex-wrap gap-1 rounded-lg border border-border bg-muted/40 p-1">
          {PERIODS.map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                period === p
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-background hover:text-foreground",
              )}
            >
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>
        {period === "personnalise" && (
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 gap-2 text-xs">
                <CalendarDays className="h-3.5 w-3.5" />
                {customStart && customEnd
                  ? `${format(new Date(customStart), "d MMM yyyy", { locale: fr })} – ${format(new Date(customEnd), "d MMM yyyy", { locale: fr })}`
                  : "Choisir une période"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="range"
                locale={fr}
                numberOfMonths={2}
                {...(customStart ? { defaultMonth: new Date(customStart) } : {})}
                selected={
                  customStart
                    ? {
                        from: new Date(customStart),
                        to: customEnd ? new Date(customEnd) : undefined,
                      }
                    : undefined
                }
                onSelect={(r: DateRange | undefined) => {
                  setCustomStart(r?.from ? format(r.from, "yyyy-MM-dd") : "");
                  setCustomEnd(r?.to ? format(r.to, "yyyy-MM-dd") : "");
                }}
              />
            </PopoverContent>
          </Popover>
        )}
        {range && period !== "personnalise" && (
          <span className="ml-auto flex items-center gap-1.5 rounded-full bg-accent px-3 py-1 text-xs font-medium text-accent-foreground">
            {format(range.start, "d MMM yyyy", { locale: fr })} –{" "}
            {format(range.end, "d MMM yyyy", { locale: fr })}
          </span>
        )}
        {!range && period !== "personnalise" && (
          <span className="ml-auto text-xs text-muted-foreground">
            Toutes les données, sans limite de date
          </span>
        )}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-3">
        <StatCard
          testId="kpi-clients"
          label="Clients"
          value={stats.clients}
          icon={Building2}
          delay={0}
          onClick={() => setDrill("clients")}
        />
        <StatCard
          testId="kpi-projects"
          label="Projets"
          value={stats.projects}
          icon={FolderKanban}
          delay={0.04}
          onClick={() => setDrill("projects")}
        />
        <StatCard
          testId="kpi-missions"
          label="Missions"
          value={stats.missions}
          icon={ListChecks}
          delay={0.08}
          onClick={() => setDrill("missions")}
        />
        <StatCard
          testId="kpi-collaborators"
          label="Collaborateurs"
          value={stats.collaborators}
          icon={Users}
          delay={0.12}
          onClick={() => setDrill("collaborators")}
        />
        <StatCard
          testId="kpi-deliverables"
          label="Livrables"
          value={stats.deliverables}
          icon={Package}
          delay={0.16}
          onClick={() => setDrill("deliverables")}
        />
        <StatCard
          testId="kpi-late-missions"
          label="Missions en retard"
          value={stats.late_missions}
          icon={AlertTriangle}
          tone="danger"
          delay={0.2}
          onClick={() => setDrill("late")}
        />
      </div>

      <div className="mt-6 flex items-baseline gap-2">
        <h2 className="text-sm font-semibold text-muted-foreground">Alertes</h2>
        <span className="text-xs text-muted-foreground">
          (toujours en temps réel, hors filtre de période)
        </span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 2xl:grid-cols-6">
        <StatCard
          label="Échéance dans 24 h"
          value={alerts?.in24h.length ?? 0}
          icon={Clock}
          tone="danger"
          delay={0}
          onClick={() => setDrill("in24h")}
        />
        <StatCard
          label="Échéance dans 48 h"
          value={alerts?.in48h.length ?? 0}
          icon={Clock}
          tone="warning"
          delay={0.04}
          onClick={() => setDrill("in48h")}
        />
        <StatCard
          label="Missions bloquées"
          value={alerts?.blocked.length ?? 0}
          icon={AlertTriangle}
          tone="danger"
          delay={0.08}
          onClick={() => setDrill("blocked")}
        />
        <StatCard
          label="Livrables en attente"
          value={alerts?.pendingDeliverables.length ?? 0}
          icon={Package}
          tone="info"
          delay={0.12}
          onClick={() => setDrill("pendingDeliverables")}
        />
        <StatCard
          label="Publications du jour"
          value={alerts?.publicationsToday?.length ?? 0}
          icon={CalendarCheck}
          tone="success"
          delay={0.16}
          onClick={() => setDrill("publicationsToday")}
        />
        {/* Prévues dans les 48 h sans être prêtes, ou date dépassée. */}
        <StatCard
          label="Publications à risque"
          value={alerts?.publicationsAtRisk.length ?? 0}
          icon={CalendarClock}
          tone="danger"
          delay={0.2}
          onClick={() => setDrill("publicationsAtRisk")}
        />
      </div>

      <div className="mt-6">
        <ContentQuotaChart />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="surface-card p-5">
          <h2 className="text-sm font-semibold">Missions par client</h2>
          <div className="mt-4 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byClient} margin={{ top: 4, right: 4, left: -20, bottom: 4 }}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="var(--color-border)"
                  vertical={false}
                />
                <XAxis
                  dataKey="name"
                  stroke="var(--color-muted-foreground)"
                  {...obliqueAxisProps(isMobile)}
                />
                <YAxis stroke="var(--color-muted-foreground)" fontSize={11} allowDecimals={false} />
                <Tooltip
                  cursor={{ fill: "var(--color-muted)" }}
                  contentStyle={{
                    background: "var(--color-popover)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 12,
                  }}
                />
                <Bar
                  dataKey="missions"
                  fill="var(--color-chart-1)"
                  radius={[6, 6, 0, 0]}
                  maxBarSize={40}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="surface-card p-5">
          <h2 className="text-sm font-semibold">Missions par collaborateur</h2>
          <div className="mt-4 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byCollab} margin={{ top: 4, right: 4, left: -20, bottom: 4 }}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="var(--color-border)"
                  vertical={false}
                />
                <XAxis
                  dataKey="name"
                  stroke="var(--color-muted-foreground)"
                  {...obliqueAxisProps(isMobile)}
                />
                <YAxis stroke="var(--color-muted-foreground)" fontSize={11} allowDecimals={false} />
                <Tooltip
                  cursor={{ fill: "var(--color-muted)" }}
                  contentStyle={{
                    background: "var(--color-popover)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 12,
                  }}
                />
                <Bar
                  dataKey="missions"
                  fill="var(--color-chart-1)"
                  radius={[6, 6, 0, 0]}
                  maxBarSize={40}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="mt-6 flex items-center justify-between">
        <h2 className="text-sm font-semibold">Missions récentes</h2>
        <Link to="/missions" className="text-xs font-medium text-primary hover:underline">
          Voir tout
        </Link>
      </div>
      <div className="mt-3">
        <MissionsTable
          missions={filteredMissions.slice(0, 5)}
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
          emptyMessage="Aucune mission sur cette période."
        />
      </div>
      <Dialog open={drill !== null} onOpenChange={(o) => !o && setDrill(null)}>
        <DialogContent
          className={cn(
            "max-h-[80vh] overflow-y-auto",
            drillMissions ? "sm:max-w-5xl" : "sm:max-w-2xl",
          )}
        >
          <DialogHeader>
            <DialogTitle>
              {drill === "clients" && "Tous les clients"}
              {drill === "projects" && "Tous les projets"}
              {drill === "missions" && "Toutes les missions"}
              {drill === "collaborators" && "Collaborateurs"}
              {drill === "deliverables" && "Livrables"}
              {drill === "late" && "Missions en retard"}
              {drill === "in24h" && "Échéances dans 24 h"}
              {drill === "in48h" && "Échéances dans 48 h"}
              {drill === "blocked" && "Missions bloquées (corrections)"}
              {drill === "pendingDeliverables" && "Livrables en attente de validation"}
              {drill === "publicationsToday" && "Publications du jour"}
              {drill === "publicationsAtRisk" && "Publications à risque"}
            </DialogTitle>
            <DialogDescription>
              Cliquez sur une ligne pour ouvrir la fiche détaillée.
            </DialogDescription>
          </DialogHeader>

          {drill === "clients" && (
            <div className="space-y-2">
              {(clients ?? []).map((c) => (
                <Link
                  key={c.id}
                  to="/clients/$clientId"
                  params={{ clientId: c.id }}
                  onClick={() => setDrill(null)}
                  className="flex items-center gap-3 rounded-lg border border-border p-3 text-sm transition hover:border-primary/50"
                >
                  <span className="flex-1 font-medium">{c.name}</span>
                  <span className="text-xs text-muted-foreground">{c.industry}</span>
                  <span className="text-xs text-muted-foreground">
                    {(missions ?? []).filter((m) => m.client_id === c.id).length} missions
                  </span>
                </Link>
              ))}
            </div>
          )}

          {drill === "projects" && (
            <div className="space-y-2">
              {(projects ?? []).map((p) => (
                <Link
                  key={p.id}
                  to="/projets/$projectId"
                  params={{ projectId: p.id }}
                  onClick={() => setDrill(null)}
                  className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-3 text-sm transition hover:border-primary/50"
                >
                  <span className="flex-1 font-medium">{p.name}</span>
                  <span className="text-xs text-muted-foreground">{clientName(p.client_id)}</span>
                  <span className="text-xs text-muted-foreground">
                    Chef : {userName(p.owner_id)}
                  </span>
                </Link>
              ))}
            </div>
          )}

          {drill === "collaborators" && (
            <div className="space-y-2">
              {collaborators.map((u) => (
                <div
                  key={u.id}
                  className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-3 text-sm"
                >
                  <span className="flex-1 font-medium">
                    {u.first_name} {u.last_name}
                  </span>
                  <span className="text-xs text-muted-foreground">{u.job_title ?? u.email}</span>
                  <span className="text-xs text-muted-foreground">
                    {
                      (missions ?? []).filter(
                        (m) => m.assignee_id === u.id || m.collaborators.includes(u.id),
                      ).length
                    }{" "}
                    missions
                  </span>
                </div>
              ))}
            </div>
          )}

          {(drill === "deliverables" || drill === "pendingDeliverables") && (
            <div className="space-y-2">
              {(drill === "deliverables"
                ? filteredDeliverables
                : (alerts?.pendingDeliverables ?? [])
              ).map((d) => (
                <Link
                  key={d.id}
                  to="/missions/$missionId"
                  params={{ missionId: d.mission_id }}
                  onClick={() => setDrill(null)}
                  className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-3 text-sm transition hover:border-primary/50"
                >
                  <span className="flex-1 font-medium">{d.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {missionTitle(d.mission_id)}
                  </span>
                  <span className="text-xs text-muted-foreground">v{d.version}</span>
                  <span className="text-xs text-muted-foreground">{userName(d.uploaded_by)}</span>
                </Link>
              ))}
            </div>
          )}

          {publicationDrill && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">{publicationDrill.hint}</p>
              {publicationDrill.items.map((d) => (
                <Link
                  key={d.id}
                  to="/missions/$missionId"
                  params={{ missionId: d.mission_id }}
                  search={{ livrable: d.id }}
                  onClick={() => setDrill(null)}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-border p-3 text-sm transition hover:border-primary/50"
                >
                  <span className="min-w-0 flex-1 font-medium">{d.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {missionTitle(d.mission_id)}
                  </span>
                  <DeliverableStateBadge deliverable={d} />
                  <ScheduledLine deliverable={d} className="w-full" />
                </Link>
              ))}
              {publicationDrill.items.length === 0 && (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  {publicationDrill.empty}
                </p>
              )}
            </div>
          )}

          {drillMissions && (
            <MissionsTable
              missions={drillMissions}
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
              onEditMission={(m) => {
                setDrill(null);
                setEditingMission(m);
              }}
              onDeleteMission={(m) => {
                setDrill(null);
                setDeletingMission(m);
              }}
              emptyMessage="Aucun élément."
            />
          )}
        </DialogContent>
      </Dialog>

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
