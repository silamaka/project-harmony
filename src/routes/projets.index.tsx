import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/app-shell";
import { ProjectStatusBadge } from "@/components/shared/badges";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { clientService, projectService, userService } from "@/services";
import { PROJECT_STATUS_LABELS, type ProjectStatus } from "@/types";

export const Route = createFileRoute("/projets/")({
  head: () => ({
    meta: [
      { title: "Projets — BEBA EMPIRE" },
      { name: "description", content: "Suivi des projets clients, statuts et progression." },
      { property: "og:title", content: "Projets — BEBA EMPIRE" },
      { property: "og:description", content: "Tous les projets de l'agence en un coup d'œil." },
    ],
  }),
  component: ProjectsPage,
});

const FILTERS: ("tous" | ProjectStatus)[] = [
  "tous",
  "brouillon",
  "en_preparation",
  "en_cours",
  "en_attente",
  "termine",
  "archive",
];

function ProjectsPage() {
  const { data: projects } = useQuery({ queryKey: ["projects"], queryFn: projectService.list });
  const { data: clients } = useQuery({ queryKey: ["clients"], queryFn: clientService.list });
  const { data: users } = useQuery({ queryKey: ["users"], queryFn: userService.list });
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<(typeof FILTERS)[number]>("tous");

  const filtered = useMemo(
    () =>
      (projects ?? []).filter(
        (p) =>
          (status === "tous" || p.status === status) &&
          p.name.toLowerCase().includes(query.toLowerCase()),
      ),
    [projects, query, status],
  );

  const clientName = (id: string) => clients?.find((c) => c.id === id)?.name ?? "—";
  const ownerName = (id: string) => {
    const u = users?.find((x) => x.id === id);
    return u ? `${u.first_name} ${u.last_name}` : "—";
  };

  return (
    <AppShell
      title="Projets"
      subtitle={`${filtered.length} projet(s)`}
      allow={["admin", "chef_projet"]}
      actions={
        <Button size="sm" onClick={() => toast.info("Formulaire de création projet à connecter.")}>
          <Plus className="mr-1 h-4 w-4" /> Nouveau projet
        </Button>
      }
    >
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-56 flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Rechercher un projet..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap gap-1 rounded-lg border border-border p-1">
          {FILTERS.map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                status === s
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent",
              )}
            >
              {s === "tous" ? "Tous" : PROJECT_STATUS_LABELS[s]}
            </button>
          ))}
        </div>
      </div>

      <div className="surface-card mt-6 overflow-x-auto p-1">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
              <th className="px-4 py-3 font-medium">Projet</th>
              <th className="px-4 py-3 font-medium">Client</th>
              <th className="px-4 py-3 font-medium">Responsable</th>
              <th className="px-4 py-3 font-medium">Échéance</th>
              <th className="px-4 py-3 font-medium">Statut</th>
              <th className="px-4 py-3 font-medium">Progression</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => (
              <tr key={p.id} className="border-b border-border/60 last:border-0 hover:bg-accent/30">
                <td className="px-4 py-3 font-medium">
                  <Link to="/projets/$projectId" params={{ projectId: p.id }} className="hover:text-primary">
                    {p.name}
                  </Link>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{clientName(p.client_id)}</td>
                <td className="px-4 py-3 text-muted-foreground">{ownerName(p.owner_id)}</td>
                <td className="px-4 py-3 text-muted-foreground">
                  {new Date(p.end_date).toLocaleDateString("fr-FR")}
                </td>
                <td className="px-4 py-3">
                  <ProjectStatusBadge status={p.status} />
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Progress value={p.progress} className="h-2 w-24" />
                    <span className="text-xs font-semibold">{p.progress}%</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
