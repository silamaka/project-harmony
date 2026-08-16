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
  CalendarDays,
  Clock,
  FolderKanban,
  ListChecks,
  Package,
  Users,
} from "lucide-react";
import type { DateRange } from "react-day-picker";
import { toast } from "sonner";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AppShell } from "@/components/layout/app-shell";
import { StatCard } from "@/components/shared/stat-card";
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

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — BEBA EMPIRE" },
      { name: "description", content: "KPIs, graphiques et alertes de l'agence en temps réel." },
      { property: "og:title", content: "Dashboard — BEBA EMPIRE" },
      { property: "og:description", content: "Pilotage global de l'activité de l'agence." },
    ],
  }),
  component: DashboardPage,
});

function DashboardPage() {
  const { data: monthly } = useQuery({
    queryKey: ["dashboard", "monthly"],
    queryFn: dashboardService.monthly,
  });
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
  const projectName = (id: string) => projects?.find((p) => p.id === id)?.name ?? "—";
  const userName = (id: string) => {
    const u = users?.find((x) => x.id === id);
    return u ? `${u.first_name} ${u.last_name}` : "—";
  };
  const missionTitle = (id: string) => missions?.find((m) => m.id === id)?.title ?? "—";

  const filteredMissions = useMemo(
    () => (missions ?? []).filter((m) => !range || isWithinInterval(new Date(m.deadline), range)),
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
        missions: filteredMissions.filter((m) => m.assignee_id === u.id).length,
      })),
    [collaborators, filteredMissions],
  );
  const completedInPeriod = filteredMissions.filter(
    (m) => m.status === "termine" || m.status === "valide",
  ).length;
  const rate = filteredMissions.length
    ? Math.round((completedInPeriod / filteredMissions.length) * 100)
    : 0;

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

  return (
    <AppShell
      title="Dashboard"
      subtitle="Vue d'ensemble de l'activité de l'agence"
      allow={["admin", "chef_projet"]}
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

      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
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
      <div className="mt-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
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
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <div className="surface-card p-5 lg:col-span-2">
          <h2 className="text-sm font-semibold">Évolution mensuelle</h2>
          <p className="text-xs text-muted-foreground">
            Tendance globale, indépendante du filtre de période.
          </p>
          <div className="mt-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={monthly ?? []}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="month" stroke="var(--color-muted-foreground)" fontSize={12} />
                <YAxis stroke="var(--color-muted-foreground)" fontSize={12} />
                <Tooltip
                  contentStyle={{
                    background: "var(--color-popover)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 12,
                    color: "var(--color-popover-foreground)",
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="missions"
                  stroke="var(--color-chart-1)"
                  strokeWidth={2}
                />
                <Line
                  type="monotone"
                  dataKey="livrables"
                  stroke="var(--color-chart-3)"
                  strokeWidth={2}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="surface-card flex flex-col items-center justify-center p-5">
          <h2 className="self-start text-sm font-semibold">Taux de réalisation</h2>
          <div className="relative mt-6 flex h-40 w-40 items-center justify-center rounded-full bg-muted">
            <div
              className="absolute inset-0 rounded-full"
              style={{
                background: `conic-gradient(var(--color-primary) ${rate * 3.6}deg, transparent 0)`,
              }}
            />
            <div className="relative flex h-28 w-28 items-center justify-center rounded-full bg-card">
              <span className="text-3xl font-extrabold">{rate}%</span>
            </div>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">Missions validées ou terminées</p>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="surface-card p-5">
          <h2 className="text-sm font-semibold">Missions par client</h2>
          <div className="mt-4 h-60">
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
                  fontSize={11}
                  interval={0}
                  angle={-20}
                  textAnchor="end"
                  height={48}
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
          <div className="mt-4 h-60">
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
                  fontSize={11}
                  interval={0}
                  angle={-20}
                  textAnchor="end"
                  height={48}
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
                  <span className="text-xs font-semibold text-primary">{p.progress}%</span>
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
                    {(missions ?? []).filter((m) => m.assignee_id === u.id).length} missions
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
