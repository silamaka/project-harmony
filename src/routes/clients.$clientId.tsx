import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Mail, MapPin, Phone } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { MissionStatusBadge, ProjectStatusBadge } from "@/components/shared/badges";
import { clientService, deliverableService, missionService, projectService } from "@/services";

export const Route = createFileRoute("/clients/$clientId")({
  head: () => ({
    meta: [
      { title: "Fiche client — BEBA EMPIRE" },
      { name: "description", content: "Informations, projets, missions et livrables du client." },
      { property: "og:title", content: "Fiche client — BEBA EMPIRE" },
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

  const clientMissions = (missions ?? []).filter((m) => m.client_id === clientId);
  const missionIds = new Set(clientMissions.map((m) => m.id));
  const clientDeliverables = (deliverables ?? []).filter((d) => missionIds.has(d.mission_id));

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

        <div className="surface-card p-5 lg:col-span-2">
          <h2 className="text-sm font-semibold">Projets</h2>
          <div className="mt-4 space-y-3">
            {(projects ?? []).map((p) => (
              <Link
                key={p.id}
                to="/projets/$projectId"
                params={{ projectId: p.id }}
                className="flex items-center gap-4 rounded-lg border border-border px-4 py-3 transition-colors hover:bg-accent/40"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{p.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(p.start_date).toLocaleDateString("fr-FR")} →{" "}
                    {new Date(p.end_date).toLocaleDateString("fr-FR")}
                  </p>
                </div>
                <ProjectStatusBadge status={p.status} />
                <span className="text-xs font-semibold">{p.progress}%</span>
              </Link>
            ))}
            {(projects ?? []).length === 0 && (
              <p className="text-xs text-muted-foreground">Aucun projet pour ce client.</p>
            )}
          </div>

          <h2 className="mt-6 text-sm font-semibold">Missions</h2>
          <div className="mt-4 space-y-2">
            {clientMissions.map((m) => (
              <Link
                key={m.id}
                to="/missions/$missionId"
                params={{ missionId: m.id }}
                className="flex items-center gap-3 rounded-lg border border-border px-4 py-2.5 text-sm transition-colors hover:bg-accent/40"
              >
                <span className="min-w-0 flex-1 truncate">{m.title}</span>
                <MissionStatusBadge status={m.status} />
              </Link>
            ))}
          </div>

          <h2 className="mt-6 text-sm font-semibold">Livrables</h2>
          <ul className="mt-4 space-y-2 text-sm">
            {clientDeliverables.map((d) => (
              <li
                key={d.id}
                className="flex items-center justify-between rounded-lg border border-border px-4 py-2.5"
              >
                <span>
                  {d.name} <span className="text-xs text-muted-foreground">v{d.version}</span>
                </span>
                <span className="text-xs text-muted-foreground">
                  {new Date(d.created_at).toLocaleDateString("fr-FR")}
                </span>
              </li>
            ))}
            {clientDeliverables.length === 0 && (
              <li className="text-xs text-muted-foreground">Aucun livrable.</li>
            )}
          </ul>
        </div>
      </div>
    </AppShell>
  );
}
