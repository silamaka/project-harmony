import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCircle2, Gauge, ListChecks, Mail, Phone, Search, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/app-shell";
import { UserAvatar } from "@/components/shared/avatar";
import { CreateUserDialog, EditUserDialog } from "@/components/shared/create-dialogs";
import { ConfirmDeleteButton } from "@/components/shared/edit-dialogs";
import { StatCard } from "@/components/shared/stat-card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { missionService, userService } from "@/services";

export const Route = createFileRoute("/collaborateurs/")({
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

const STATUS = ["tous", "actif", "inactif"] as const;

const workloadTone = (w: number) =>
  w >= 85 ? "bg-destructive" : w >= 60 ? "bg-warning" : "bg-primary";

function CollaboratorsPage() {
  const qc = useQueryClient();
  const { data: collaborators } = useQuery({
    queryKey: ["collaborators"],
    queryFn: userService.collaborators,
  });
  const { data: missions } = useQuery({ queryKey: ["missions"], queryFn: missionService.list });
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<(typeof STATUS)[number]>("tous");

  const removeCollaborator = useMutation({
    mutationFn: (id: string) => userService.remove(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["collaborators"] });
      void qc.invalidateQueries({ queryKey: ["users"] });
      toast.success("Collaborateur supprimé.");
    },
    onError: () => toast.error("Suppression impossible."),
  });

  const filtered = useMemo(
    () =>
      (collaborators ?? []).filter(
        (u) =>
          (status === "tous" || (status === "actif" ? u.is_active : !u.is_active)) &&
          `${u.first_name} ${u.last_name} ${u.job_title ?? ""}`
            .toLowerCase()
            .includes(query.toLowerCase()),
      ),
    [collaborators, query, status],
  );

  const allCollaborators = collaborators ?? [];
  const stats = {
    total: allCollaborators.length,
    actifs: allCollaborators.filter((u) => u.is_active).length,
    chargeMoyenne: allCollaborators.length
      ? Math.round(
          allCollaborators.reduce((sum, u) => sum + (u.workload ?? 0), 0) / allCollaborators.length,
        )
      : 0,
    missionsAssignees: (missions ?? []).length,
  };

  return (
    <AppShell
      title="Collaborateurs"
      subtitle={`${filtered.length} membre(s) de l'équipe`}
      allow={["admin", "chef_projet"]}
      actions={
        <CreateUserDialog role="collaborateur" lockRole triggerLabel="Ajouter un collaborateur" />
      }
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Collaborateurs" value={stats.total} icon={Users} />
        <StatCard
          label="Actifs"
          value={stats.actifs}
          icon={CheckCircle2}
          tone="success"
          delay={0.04}
        />
        <StatCard
          label="Charge moyenne"
          value={`${stats.chargeMoyenne}%`}
          icon={Gauge}
          tone="info"
          delay={0.08}
        />
        <StatCard
          label="Missions assignées"
          value={stats.missionsAssignees}
          icon={ListChecks}
          delay={0.12}
        />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <div className="relative min-w-56 flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Rechercher un collaborateur..."
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
                status === s
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent",
              )}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {filtered.map((u) => {
          const own = (missions ?? []).filter((m) => m.assignee_id === u.id);
          const workload = u.workload ?? 0;
          return (
            <div
              key={u.id}
              className={cn("surface-card flex h-full flex-col p-5", !u.is_active && "opacity-60")}
            >
              <Link to="/collaborateurs/$userId" params={{ userId: u.id }} className="block">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <UserAvatar user={u} className="h-12 w-12 text-sm" />
                    <div className="min-w-0">
                      <p className="truncate font-semibold">
                        {u.first_name} {u.last_name}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">{u.job_title}</p>
                    </div>
                  </div>
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold",
                      u.is_active ? "bg-success/15 text-success" : "bg-muted text-muted-foreground",
                    )}
                  >
                    {u.is_active ? "Actif" : "Inactif"}
                  </span>
                </div>
                <ul className="mt-4 space-y-2 text-xs text-muted-foreground">
                  <li className="flex items-center gap-2">
                    <Mail className="h-3.5 w-3.5 shrink-0" />{" "}
                    <span className="truncate">{u.email}</span>
                  </li>
                  {u.phone && (
                    <li className="flex items-center gap-2">
                      <Phone className="h-3.5 w-3.5 shrink-0" /> {u.phone}
                    </li>
                  )}
                </ul>
                <div className="mt-4">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Charge de travail</span>
                    <span className="font-semibold">{workload}%</span>
                  </div>
                  <Progress
                    value={workload}
                    className="mt-2 h-2"
                    indicatorClassName={workloadTone(workload)}
                  />
                </div>
              </Link>
              <div className="mt-auto flex items-center justify-between border-t border-border pt-3">
                <p className="text-xs text-muted-foreground">{own.length} mission(s) assignée(s)</p>
                <div className="flex items-center gap-2">
                  <EditUserDialog user={u} />
                  <ConfirmDeleteButton
                    title={`Supprimer ${u.first_name} ${u.last_name} ?`}
                    description="Le collaborateur sera retiré de l'équipe. Cette action est irréversible."
                    pending={removeCollaborator.isPending && removeCollaborator.variables === u.id}
                    onConfirm={() => removeCollaborator.mutate(u.id)}
                  />
                </div>
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <p className="col-span-full py-10 text-center text-sm text-muted-foreground">
            Aucun collaborateur.
          </p>
        )}
      </div>
    </AppShell>
  );
}
