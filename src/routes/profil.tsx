import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/app-shell";
import { MissionStatusBadge } from "@/components/shared/badges";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { useAuth } from "@/context/auth-context";
import { missionService } from "@/services";
import { ROLE_LABELS } from "@/types";

export const Route = createFileRoute("/profil")({
  head: () => ({
    meta: [
      { title: "Mon profil — BEBA EMPIRE" },
      {
        name: "description",
        content: "Coordonnées, rôle, charge de travail et missions en cours du compte connecté.",
      },
      { property: "og:title", content: "Mon profil — BEBA EMPIRE" },
      { property: "og:description", content: "Gérez vos informations personnelles." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ProfilePage,
});

function ProfilePage() {
  const { user, updateProfile } = useAuth();
  const { data: missions } = useQuery({ queryKey: ["missions"], queryFn: missionService.list });
  const [form, setForm] = useState({
    first_name: user?.first_name ?? "",
    last_name: user?.last_name ?? "",
    email: user?.email ?? "",
    phone: user?.phone ?? "",
    job_title: user?.job_title ?? "",
  });

  const mine = (missions ?? []).filter((m) => m.assignee_id === user?.id);

  return (
    <AppShell title="Mon profil" subtitle={user ? ROLE_LABELS[user.role] : undefined}>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="surface-card p-5 lg:col-span-2">
          <h2 className="text-sm font-semibold">Informations personnelles</h2>
          <form
            className="mt-4 grid gap-4 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              updateProfile(form);
              toast.success("Profil mis à jour.");
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="pf-first" className="text-xs">
                Prénom
              </Label>
              <Input
                id="pf-first"
                value={form.first_name}
                onChange={(e) => setForm((f) => ({ ...f, first_name: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pf-last" className="text-xs">
                Nom
              </Label>
              <Input
                id="pf-last"
                value={form.last_name}
                onChange={(e) => setForm((f) => ({ ...f, last_name: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pf-email" className="text-xs">
                Email
              </Label>
              <Input
                id="pf-email"
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pf-phone" className="text-xs">
                Téléphone
              </Label>
              <Input
                id="pf-phone"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="pf-job" className="text-xs">
                Fonction
              </Label>
              <Input
                id="pf-job"
                value={form.job_title}
                onChange={(e) => setForm((f) => ({ ...f, job_title: e.target.value }))}
              />
            </div>
            <div className="sm:col-span-2">
              <Button type="submit">Enregistrer</Button>
            </div>
          </form>
        </div>

        <div className="space-y-4">
          <div className="surface-card p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-base font-bold text-primary-foreground">
                {form.first_name[0]}
                {form.last_name[0]}
              </div>
              <div className="min-w-0">
                <p className="truncate font-semibold">
                  {form.first_name} {form.last_name}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {user ? ROLE_LABELS[user.role] : ""}
                </p>
              </div>
            </div>
            <div className="mt-5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Charge de travail</span>
                <span className="font-semibold">{user?.workload ?? 0}%</span>
              </div>
              <Progress value={user?.workload ?? 0} className="mt-2 h-2" />
            </div>
          </div>

          <div className="surface-card p-5">
            <h2 className="text-sm font-semibold">Mes missions ({mine.length})</h2>
            <ul className="mt-3 space-y-2">
              {mine.slice(0, 6).map((m) => (
                <li key={m.id} className="flex items-center gap-2 text-xs">
                  <span className="min-w-0 flex-1 truncate">{m.title}</span>
                  <MissionStatusBadge status={m.status} />
                </li>
              ))}
              {mine.length === 0 && (
                <li className="text-xs text-muted-foreground">Aucune mission assignée.</li>
              )}
            </ul>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
