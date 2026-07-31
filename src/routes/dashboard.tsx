import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  Building2,
  Clock,
  FolderKanban,
  ListChecks,
  Package,
  Users,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AppShell } from "@/components/layout/app-shell";
import { MissionStatusBadge, PriorityBadge } from "@/components/shared/badges";
import { StatCard } from "@/components/shared/stat-card";
import { dashboardService, missionService } from "@/services";

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
  const { data: stats } = useQuery({ queryKey: ["dashboard", "stats"], queryFn: dashboardService.stats });
  const { data: byClient } = useQuery({
    queryKey: ["dashboard", "byClient"],
    queryFn: dashboardService.missionsByClient,
  });
  const { data: byCollab } = useQuery({
    queryKey: ["dashboard", "byCollab"],
    queryFn: dashboardService.missionsByCollaborator,
  });
  const { data: monthly } = useQuery({
    queryKey: ["dashboard", "monthly"],
    queryFn: dashboardService.monthly,
  });
  const { data: rate } = useQuery({
    queryKey: ["dashboard", "rate"],
    queryFn: dashboardService.completionRate,
  });
  const { data: alerts } = useQuery({
    queryKey: ["dashboard", "alerts"],
    queryFn: dashboardService.alerts,
  });
  const { data: missions } = useQuery({ queryKey: ["missions"], queryFn: missionService.list });

  return (
    <AppShell
      title="Dashboard"
      subtitle="Vue d'ensemble de l'activité de l'agence"
      allow={["admin", "chef_projet"]}
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard label="Clients" value={stats?.clients ?? 0} icon={Building2} delay={0} />
        <StatCard label="Projets" value={stats?.projects ?? 0} icon={FolderKanban} delay={0.04} />
        <StatCard label="Missions" value={stats?.missions ?? 0} icon={ListChecks} delay={0.08} />
        <StatCard label="Collaborateurs" value={stats?.collaborators ?? 0} icon={Users} delay={0.12} />
        <StatCard label="Livrables" value={stats?.deliverables ?? 0} icon={Package} delay={0.16} />
        <StatCard
          label="Missions en retard"
          value={stats?.late_missions ?? 0}
          icon={AlertTriangle}
          tone="danger"
          delay={0.2}
        />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <div className="surface-card p-5 lg:col-span-2">
          <h2 className="text-sm font-semibold">Évolution mensuelle</h2>
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
                <Line type="monotone" dataKey="missions" stroke="var(--color-chart-1)" strokeWidth={2} />
                <Line type="monotone" dataKey="livrables" stroke="var(--color-chart-3)" strokeWidth={2} />
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
                background: `conic-gradient(var(--color-primary) ${(rate ?? 0) * 3.6}deg, transparent 0)`,
              }}
            />
            <div className="relative flex h-28 w-28 items-center justify-center rounded-full bg-card">
              <span className="text-3xl font-extrabold">{rate ?? 0}%</span>
            </div>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">Missions validées ou terminées</p>
        </div>

        <div className="surface-card p-5">
          <h2 className="text-sm font-semibold">Missions par client</h2>
          <div className="mt-4 h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byClient ?? []}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="name" stroke="var(--color-muted-foreground)" fontSize={11} />
                <YAxis stroke="var(--color-muted-foreground)" fontSize={11} allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    background: "var(--color-popover)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 12,
                  }}
                />
                <Bar dataKey="missions" radius={[6, 6, 0, 0]}>
                  {(byClient ?? []).map((_, i) => (
                    <Cell key={i} fill={`var(--color-chart-${(i % 5) + 1})`} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="surface-card p-5">
          <h2 className="text-sm font-semibold">Missions par collaborateur</h2>
          <div className="mt-4 h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byCollab ?? []} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis type="number" stroke="var(--color-muted-foreground)" fontSize={11} allowDecimals={false} />
                <YAxis
                  type="category"
                  dataKey="name"
                  stroke="var(--color-muted-foreground)"
                  fontSize={11}
                  width={110}
                />
                <Tooltip
                  contentStyle={{
                    background: "var(--color-popover)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 12,
                  }}
                />
                <Bar dataKey="missions" fill="var(--color-chart-1)" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="surface-card p-5">
          <h2 className="text-sm font-semibold">Alertes</h2>
          <ul className="mt-4 space-y-3 text-sm">
            <AlertRow
              icon={<Clock className="h-4 w-4 text-destructive" />}
              label="Échéance dans 24 h"
              count={alerts?.in24h.length ?? 0}
            />
            <AlertRow
              icon={<Clock className="h-4 w-4 text-warning" />}
              label="Échéance dans 48 h"
              count={alerts?.in48h.length ?? 0}
            />
            <AlertRow
              icon={<AlertTriangle className="h-4 w-4 text-destructive" />}
              label="Missions bloquées"
              count={alerts?.blocked.length ?? 0}
            />
            <AlertRow
              icon={<Package className="h-4 w-4 text-info" />}
              label="Livrables en attente"
              count={alerts?.pendingDeliverables.length ?? 0}
            />
          </ul>
        </div>
      </div>

      <div className="surface-card mt-6 p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Missions récentes</h2>
          <Link to="/missions" className="text-xs font-medium text-primary hover:underline">
            Voir tout
          </Link>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                <th className="pb-2 font-medium">Mission</th>
                <th className="pb-2 font-medium">Priorité</th>
                <th className="pb-2 font-medium">Statut</th>
                <th className="pb-2 font-medium">Deadline</th>
              </tr>
            </thead>
            <tbody>
              {(missions ?? []).slice(0, 5).map((m) => (
                <tr key={m.id} className="border-b border-border/60 last:border-0">
                  <td className="py-3 pr-4 font-medium">
                    <Link to="/missions/$missionId" params={{ missionId: m.id }} className="hover:text-primary">
                      {m.title}
                    </Link>
                  </td>
                  <td className="py-3 pr-4">
                    <PriorityBadge priority={m.priority} />
                  </td>
                  <td className="py-3 pr-4">
                    <MissionStatusBadge status={m.status} />
                  </td>
                  <td className="py-3 text-muted-foreground">
                    {new Date(m.deadline).toLocaleDateString("fr-FR")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}

function AlertRow({ icon, label, count }: { icon: React.ReactNode; label: string; count: number }) {
  return (
    <li className="flex items-center gap-3 rounded-lg border border-border px-3 py-2">
      {icon}
      <span className="flex-1">{label}</span>
      <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-bold">{count}</span>
    </li>
  );
}
