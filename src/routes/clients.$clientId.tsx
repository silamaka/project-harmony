import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Briefcase, FileText, Mail, MapPin, Phone, Users } from "lucide-react";
import { useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { MissionStatusBadge, PriorityBadge, ProjectStatusBadge } from "@/components/shared/badges";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import {
  clientService,
  deliverableService,
  missionService,
  projectService,
  userService,
} from "@/services";

export const Route = createFileRoute("/clients/$clientId")({
  head: () => ({
    meta: [
      { title: "Fiche client 360° — BEBA EMPIRE" },
      {
        name: "description",
        content: "Projets, missions, livrables et équipe affectée au compte client.",
      },
      { property: "og:title", content: "Fiche client 360° — BEBA EMPIRE" },
      { property: "og:description", content: "Vue à 360° du compte client." },
    ],
  }),
  component: ClientDetailPage,
});

function ClientDetailPage() {
  const { clientId } = Route.useParams();
  const { data: client } = useQuery({
    queryKey: ["clients", clientId],
    queryFn: () => clientService.get(clientId),
  });
  const { data: projects } = useQuery({
    queryKey: ["projects", "client", clientId],
    queryFn: () => projectService.byClient(clientId),
  });
  const { data: missions } = useQuery({ queryKey: ["missions"], queryFn: missionService.list });
  const { data: deliverables } = useQuery({
    queryKey: ["deliverables"],
    queryFn: deliverableService.list,
  });
  const { data: users } = useQuery({ queryKey: ["users"], queryFn: userService.list });

  const projectList = projects ?? [];
  const projectIds = new Set(projectList.map((p) => p.id));
  const clientMissions = (missions ?? []).filter(
    (m) => m.client_id === clientId || projectIds.has(m.project_id),
  );
  const missionIds = new Set(clientMissions.map((m) => m.id));
  const clientDeliverables = (deliverables ?? []).filter((d) => missionIds.has(d.mission_id));

  const userName = (id?: string) => {
    const u = (users ?? []).find((x) => x.id === id);
    return u ? `${u.first_name} ${u.last_name}` : "—";
  };
  const projectName = (id: string) => projectList.find((p) => p.id === id)?.name ?? "—";
  const missionTitle = (id: string) => clientMissions.find((m) => m.id === id)?.title ?? "—";

  // Qui travaille sur quoi : regroupement des missions par collaborateur
  const teamMap = new Map<string, typeof clientMissions>();
  for (const m of clientMissions) {
    teamMap.set(m.assignee_id, [...(teamMap.get(m.assignee_id) ?? []), m]);
  }
  const team = [...teamMap.entries()];
  const managerIds = [...new Set(projectList.map((p) => p.owner_id))];

  const stats = [
    { label: "Projets", value: projectList.length, icon: Briefcase },
    { label: "Missions", value: clientMissions.length, icon: FileText },
    { label: "Livrables", value: clientDeliverables.length, icon: FileText },
    { label: "Intervenants", value: team.length, icon: Users },
  ];

  return (
    <AppShell
      title={client?.name ?? "Client"}
      subtitle={client?.industry}
      allow={["admin", "chef_projet"]}
    >
      <Link
        to="/clients"
        className="inline-flex items-center gap-2 text-xs font-medium text-primary hover:underline"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Retour aux clients
      </Link>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="surface-card flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <s.icon className="h-4.5 w-4.5" />
            </div>
            <div>
              <p className="text-xl font-bold">{s.value}</p>
              <p className="text-xs text-muted-foreground">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <div className="surface-card p-5">
          <h2 className="text-sm font-semibold">Informations générales</h2>
          <ul className="mt-4 space-y-3 text-sm">
            <li className="flex items-center gap-2 text-muted-foreground">
              <Mail className="h-4 w-4" /> {client?.email}
            </li>
            {client?.phone && (
              <li className="flex items-center gap-2 text-muted-foreground">
                <Phone className="h-4 w-4" /> {client.phone}
              </li>
            )}
            {client?.address && (
              <li className="flex items-center gap-2 text-muted-foreground">
                <MapPin className="h-4 w-4" /> {client.address}
              </li>
            )}
          </ul>

          <h3 className="mt-6 text-sm font-semibold">Chef(s) de projet</h3>
          <ul className="mt-3 space-y-2 text-sm">
            {managerIds.map((id) => (
              <li key={id} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                  {userName(id).slice(0, 2).toUpperCase()}
                </span>
                <div className="min-w-0">
                  <p className="truncate font-medium">{userName(id)}</p>
                  <p className="text-xs text-muted-foreground">
                    {projectList.filter((p) => p.owner_id === id).length} projet(s) pilotés
                  </p>
                </div>
              </li>
            ))}
            {managerIds.length === 0 && (
              <li className="text-xs text-muted-foreground">Aucun chef de projet assigné.</li>
            )}
          </ul>

          <h3 className="mt-6 text-sm font-semibold">Contacts</h3>
          <ul className="mt-3 space-y-2 text-sm">
            {(client?.contacts ?? []).map((ct) => (
              <li key={ct.id} className="rounded-lg border border-border px-3 py-2">
                <p className="font-medium">{ct.name}</p>
                <p className="text-xs text-muted-foreground">
                  {ct.position} · {ct.email}
                </p>
              </li>
            ))}
            {client?.contacts.length === 0 && (
              <li className="text-xs text-muted-foreground">Aucun contact enregistré.</li>
            )}
          </ul>
        </div>

        <div className="lg:col-span-2">
          <div className="surface-card p-5">
            <h2 className="text-sm font-semibold">Projets</h2>
            <div className="mt-4 space-y-3">
              {projectList.map((p) => {
                const pm = clientMissions.filter((m) => m.project_id === p.id);
                return (
                  <Link
                    key={p.id}
                    to="/projets/$projectId"
                    params={{ projectId: p.id }}
                    className="block rounded-lg border border-border px-4 py-3 transition-colors hover:bg-accent/40"
                  >
                    <div className="flex flex-wrap items-center gap-3">
                      <p className="min-w-0 flex-1 truncate text-sm font-medium">{p.name}</p>
                      <ProjectStatusBadge status={p.status} />
                      <span className="text-xs font-semibold">{p.progress}%</span>
                    </div>
                    <Progress value={p.progress} className="mt-2 h-1.5" />
                    <p className="mt-2 text-xs text-muted-foreground">
                      Chef de projet : <span className="font-medium text-foreground">{userName(p.owner_id)}</span>{" "}
                      · {pm.length} mission(s) ·{" "}
                      {new Date(p.start_date).toLocaleDateString("fr-FR")} →{" "}
                      {new Date(p.end_date).toLocaleDateString("fr-FR")}
                    </p>
                  </Link>
                );
              })}
              {projectList.length === 0 && (
                <p className="text-xs text-muted-foreground">Aucun projet pour ce client.</p>
              )}
            </div>
          </div>

          <div className="surface-card mt-4 p-5">
            <h2 className="text-sm font-semibold">Qui travaille sur quoi</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {team.map(([uid, ms]) => (
                <div key={uid} className="rounded-lg border border-border p-3">
                  <div className="flex items-center gap-2">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-xs font-bold">
                      {userName(uid).slice(0, 2).toUpperCase()}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{userName(uid)}</p>
                      <p className="text-xs text-muted-foreground">{ms.length} mission(s)</p>
                    </div>
                  </div>
                  <ul className="mt-2 space-y-1">
                    {ms.map((m) => (
                      <li key={m.id} className="flex items-center gap-2 text-xs">
                        <span className="min-w-0 flex-1 truncate">{m.title}</span>
                        <MissionStatusBadge status={m.status} />
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              {team.length === 0 && (
                <p className="text-xs text-muted-foreground">Aucun collaborateur affecté.</p>
              )}
            </div>
          </div>

          <div className="surface-card mt-4 p-5">
            <h2 className="text-sm font-semibold">Missions</h2>
            <div className="mt-4 space-y-2">
              {clientMissions.map((m) => (
                <Link
                  key={m.id}
                  to="/missions/$missionId"
                  params={{ missionId: m.id }}
                  className="block rounded-lg border border-border px-4 py-2.5 text-sm transition-colors hover:bg-accent/40"
                >
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="min-w-0 flex-1 truncate font-medium">{m.title}</span>
                    <PriorityBadge priority={m.priority} />
                    <MissionStatusBadge status={m.status} />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {projectName(m.project_id)} · Assignée à{" "}
                    <span className="font-medium text-foreground">{userName(m.assignee_id)}</span> ·
                    Échéance {new Date(m.deadline).toLocaleDateString("fr-FR")}
                  </p>
                </Link>
              ))}
              {clientMissions.length === 0 && (
                <p className="text-xs text-muted-foreground">Aucune mission.</p>
              )}
            </div>
          </div>

          <div className="surface-card mt-4 p-5">
            <h2 className="text-sm font-semibold">Livrables</h2>
            <ul className="mt-4 space-y-2 text-sm">
              {clientDeliverables.map((d) => (
                <li key={d.id} className="rounded-lg border border-border px-4 py-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="min-w-0 flex-1 truncate font-medium">
                      {d.name} <span className="text-xs text-muted-foreground">v{d.version}</span>
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(d.created_at).toLocaleDateString("fr-FR")}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {missionTitle(d.mission_id)} · Déposé par{" "}
                    <span className="font-medium text-foreground">{userName(d.uploaded_by)}</span> ·{" "}
                    {d.status}
                  </p>
                </li>
              ))}
              {clientDeliverables.length === 0 && (
                <li className="text-xs text-muted-foreground">Aucun livrable.</li>
              )}
            </ul>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
