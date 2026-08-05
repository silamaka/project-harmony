import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { clientService, missionService, projectService } from "@/services";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/clients/")({
  head: () => ({
    meta: [
      { title: "Clients — BEBA EMPIRE" },
      { name: "description", content: "Gérez le portefeuille clients de l'agence." },
      { property: "og:title", content: "Clients — BEBA EMPIRE" },
      { property: "og:description", content: "CRUD complet du portefeuille clients." },
    ],
  }),
  component: ClientsPage,
});

const STATUS = ["tous", "actif", "prospect", "inactif"] as const;

function ClientsPage() {
  const { data: clients } = useQuery({ queryKey: ["clients"], queryFn: clientService.list });
  const { data: projects } = useQuery({ queryKey: ["projects"], queryFn: projectService.list });
  const { data: missions } = useQuery({ queryKey: ["missions"], queryFn: missionService.list });
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<(typeof STATUS)[number]>("tous");

  const filtered = useMemo(
    () =>
      (clients ?? []).filter(
        (c) =>
          (status === "tous" || c.status === status) &&
          (c.name.toLowerCase().includes(query.toLowerCase()) ||
            c.industry.toLowerCase().includes(query.toLowerCase())),
      ),
    [clients, query, status],
  );

  return (
    <AppShell
      title="Clients"
      subtitle={`${filtered.length} client(s)`}
      allow={["admin", "chef_projet"]}
      actions={
        <Button size="sm" onClick={() => toast.info("Formulaire de création client à connecter.")}>
          <Plus className="mr-1 h-4 w-4" /> Nouveau client
        </Button>
      }
    >
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-56 flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Rechercher un client..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-1 rounded-lg border border-border p-1">
          {STATUS.map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium capitalize transition-colors",
                status === s ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent",
              )}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {filtered.map((c) => {
          const clientProjects = (projects ?? []).filter((p) => p.client_id === c.id);
          const count = clientProjects.length;
          const projectIds = new Set(clientProjects.map((p) => p.id));
          const missionCount = (missions ?? []).filter(
            (m) => m.client_id === c.id || projectIds.has(m.project_id),
          ).length;
          return (
            <Link
              key={c.id}
              to="/clients/$clientId"
              params={{ clientId: c.id }}
              className="surface-card block p-5 transition-shadow hover:shadow-[var(--shadow-elevated)]"
            >
              <div className="flex items-start justify-between">
                <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-sm font-bold text-primary">
                  {c.name.slice(0, 2).toUpperCase()}
                </div>
                <span
                  className={cn(
                    "rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize",
                    c.status === "actif"
                      ? "bg-success/15 text-success"
                      : c.status === "prospect"
                        ? "bg-info/15 text-info"
                        : "bg-muted text-muted-foreground",
                  )}
                >
                  {c.status}
                </span>
              </div>
              <h3 className="mt-4 font-semibold">{c.name}</h3>
              <p className="text-xs text-muted-foreground">{c.industry}</p>
              <div className="mt-4 flex items-center justify-between border-t border-border pt-3 text-xs text-muted-foreground">
                <span>{count} projet(s)</span>
                <span>{missionCount} mission(s)</span>
                <span>{c.contacts.length} contact(s)</span>
              </div>
            </Link>
          );
        })}
      </div>
    </AppShell>
  );
}
