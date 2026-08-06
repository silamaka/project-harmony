import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Download } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  dashboardService,
  deliverableService,
  missionService,
  projectService,
  isLate,
} from "@/services";
import { MISSION_STATUS_LABELS, PROJECT_STATUS_LABELS } from "@/types";

export const Route = createFileRoute("/statistiques")({
  head: () => ({
    meta: [
      { title: "Statistiques & reporting — BEBA EMPIRE" },
      {
        name: "description",
        content:
          "Analyse de la performance : missions par client, par collaborateur, respect des délais et évolution mensuelle.",
      },
      { property: "og:title", content: "Statistiques & reporting — BEBA EMPIRE" },
      {
        property: "og:description",
        content: "Reporting complet de l'activité de l'agence BEBA EMPIRE.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: StatisticsPage,
});

const CHART_COLORS = [
  "var(--color-chart-1, var(--primary))",
  "oklch(0.7 0.15 250)",
  "oklch(0.75 0.13 190)",
  "oklch(0.72 0.16 30)",
  "oklch(0.68 0.14 300)",
  "oklch(0.78 0.14 140)",
];

function StatisticsPage() {
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
  const { data: missions } = useQuery({ queryKey: ["missions"], queryFn: missionService.list });
  const { data: projects } = useQuery({ queryKey: ["projects"], queryFn: projectService.list });
  const { data: deliverables } = useQuery({
    queryKey: ["deliverables"],
    queryFn: deliverableService.list,
  });

  const missionList = missions ?? [];
  const statusData = Object.entries(MISSION_STATUS_LABELS)
    .map(([key, label]) => ({
      name: label,
      value: missionList.filter((m) => m.status === key).length,
    }))
    .filter((d) => d.value > 0);

  const projectStatusData = Object.entries(PROJECT_STATUS_LABELS)
    .map(([key, label]) => ({
      name: label,
      value: (projects ?? []).filter((p) => p.status === key).length,
    }))
    .filter((d) => d.value > 0);

  const late = missionList.filter(isLate).length;
  const done = missionList.filter((m) => m.status === "termine" || m.status === "valide").length;
  const onTimeRate = missionList.length
    ? Math.round(((missionList.length - late) / missionList.length) * 100)
    : 0;
  const completion = missionList.length ? Math.round((done / missionList.length) * 100) : 0;
  const validatedDeliverables = (deliverables ?? []).filter((d) => d.status === "valide").length;
  const validationRate = (deliverables ?? []).length
    ? Math.round((validatedDeliverables / (deliverables ?? []).length) * 100)
    : 0;

  const exportCsv = () => {
    const rows = [
      ["Indicateur", "Valeur"],
      ["Missions totales", String(missionList.length)],
      ["Missions terminées/validées", String(done)],
      ["Missions en retard", String(late)],
      ["Taux d'achèvement (%)", String(completion)],
      ["Respect des délais (%)", String(onTimeRate)],
      ["Livrables", String((deliverables ?? []).length)],
      ["Livrables validés (%)", String(validationRate)],
      ["Projets", String((projects ?? []).length)],
    ];
    const csv = rows.map((r) => r.join(";")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "beba-statistiques.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const kpis = [
    { label: "Taux d'achèvement", value: completion },
    { label: "Respect des délais", value: onTimeRate },
    { label: "Livrables validés", value: validationRate },
  ];

  return (
    <AppShell
      title="Statistiques & reporting"
      subtitle="Performance de l'agence, des clients et des collaborateurs"
      allow={["admin", "chef_projet"]}
      actions={
        <Button variant="outline" size="sm" onClick={exportCsv}>
          <Download className="mr-1 h-4 w-4" /> Exporter CSV
        </Button>
      }
    >
      <div className="grid gap-3 sm:grid-cols-3">
        {kpis.map((k) => (
          <div key={k.label} className="surface-card p-5">
            <p className="text-xs text-muted-foreground">{k.label}</p>
            <p className="mt-1 text-2xl font-bold">{k.value}%</p>
            <Progress value={k.value} className="mt-3 h-2" />
          </div>
        ))}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="surface-card p-5">
          <h2 className="text-sm font-semibold">Missions par client</h2>
          <div className="mt-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byClient ?? []}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} height={50} angle={-15} textAnchor="end" />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="missions" fill="var(--primary)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="surface-card p-5">
          <h2 className="text-sm font-semibold">Charge par collaborateur</h2>
          <div className="mt-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byCollab ?? []} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={110} />
                <Tooltip />
                <Bar dataKey="missions" fill="var(--primary)" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="surface-card p-5">
          <h2 className="text-sm font-semibold">Évolution mensuelle</h2>
          <div className="mt-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={monthly ?? []}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="missions" stroke="var(--primary)" strokeWidth={2} />
                <Line
                  type="monotone"
                  dataKey="livrables"
                  stroke="oklch(0.72 0.16 30)"
                  strokeWidth={2}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="surface-card p-5">
          <h2 className="text-sm font-semibold">Répartition des missions par statut</h2>
          <div className="mt-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={statusData} dataKey="value" nameKey="name" outerRadius={80} label>
                  {statusData.map((entry, i) => (
                    <Cell key={entry.name} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="surface-card mt-4 p-5">
        <h2 className="text-sm font-semibold">Portefeuille de projets</h2>
        <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {projectStatusData.map((s) => (
            <li
              key={s.name}
              className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm"
            >
              <span className="text-muted-foreground">{s.name}</span>
              <span className="font-semibold">{s.value}</span>
            </li>
          ))}
        </ul>
      </div>
    </AppShell>
  );
}
