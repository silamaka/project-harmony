import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Mail, Phone, Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { missionService, userService } from "@/services";

export const Route = createFileRoute("/collaborateurs")({
  head: () => ({
    meta: [
      { title: "Collaborateurs — BEBA EMPIRE" },
      { name: "description", content: "Équipe, charge de travail et missions assignées." },
      { property: "og:title", content: "Collaborateurs — BEBA EMPIRE" },
      { property: "og:description", content: "Pilotez l'équipe et la charge de travail." },
    ],
  }),
  component: CollaboratorsPage,
});

function CollaboratorsPage() {
  const { data: collaborators } = useQuery({
    queryKey: ["collaborators"],
    queryFn: userService.collaborators,
  });
  const { data: missions } = useQuery({ queryKey: ["missions"], queryFn: missionService.list });
  const [query, setQuery] = useState("");

  const filtered = useMemo(
    () =>
      (collaborators ?? []).filter((u) =>
        `${u.first_name} ${u.last_name} ${u.job_title ?? ""}`
          .toLowerCase()
          .includes(query.toLowerCase()),
      ),
    [collaborators, query],
  );

  return (
    <AppShell
      title="Collaborateurs"
      subtitle={`${filtered.length} membre(s) de l'équipe`}
      allow={["admin", "chef_projet"]}
      actions={
        <Button size="sm" onClick={() => toast.info("Formulaire d'ajout collaborateur à connecter.")}>
          <Plus className="mr-1 h-4 w-4" /> Ajouter
        </Button>
      }
    >
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Rechercher un collaborateur..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {filtered.map((u) => {
          const own = (missions ?? []).filter((m) => m.assignee_id === u.id);
          return (
            <div key={u.id} className="surface-card p-5">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                  {u.first_name[0]}
                  {u.last_name[0]}
                </div>
                <div className="min-w-0">
                  <p className="truncate font-semibold">
                    {u.first_name} {u.last_name}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">{u.job_title}</p>
                </div>
              </div>
              <ul className="mt-4 space-y-2 text-xs text-muted-foreground">
                <li className="flex items-center gap-2">
                  <Mail className="h-3.5 w-3.5" /> {u.email}
                </li>
                {u.phone && (
                  <li className="flex items-center gap-2">
                    <Phone className="h-3.5 w-3.5" /> {u.phone}
                  </li>
                )}
              </ul>
              <div className="mt-4">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Charge de travail</span>
                  <span className="font-semibold">{u.workload ?? 0}%</span>
                </div>
                <Progress value={u.workload ?? 0} className="mt-2 h-2" />
              </div>
              <p className="mt-4 border-t border-border pt-3 text-xs text-muted-foreground">
                {own.length} mission(s) assignée(s)
              </p>
            </div>
          );
        })}
      </div>
    </AppShell>
  );
}
