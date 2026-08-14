import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/app-shell";
import { UserAvatar } from "@/components/shared/avatar";
import { MissionStatusBadge } from "@/components/shared/badges";
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

function ReadField({ label, value }: { label: string; value?: string | undefined }) {
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium">{value?.trim() ? value : "—"}</p>
    </div>
  );
}

function ProfilePage() {
  const { user } = useAuth();
  const { data: missions } = useQuery({ queryKey: ["missions"], queryFn: missionService.list });

  const mine = (missions ?? []).filter((m) => m.assignee_id === user?.id);

  return (
    <AppShell title="Mon profil" subtitle={user ? ROLE_LABELS[user.role] : undefined}>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="surface-card p-5 lg:col-span-2">
          <h2 className="text-sm font-semibold">Informations personnelles</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Consultation uniquement. Pour toute modification, contactez un administrateur
            (Paramètres &gt; Utilisateurs et rôles).
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <ReadField label="Prénom" value={user?.first_name} />
            <ReadField label="Nom" value={user?.last_name} />
            <ReadField label="Email" value={user?.email} />
            <ReadField label="Téléphone" value={user?.phone} />
            <ReadField label="Fonction" value={user?.job_title} />
            <ReadField label="Rôle" value={user ? ROLE_LABELS[user.role] : undefined} />
          </div>
        </div>

        <div className="space-y-4">
          <div className="surface-card p-5">
            <div className="flex items-center gap-3">
              <UserAvatar
                user={user ?? { first_name: "", last_name: "" }}
                className="h-14 w-14 text-base"
              />
              <div className="min-w-0">
                <p className="truncate font-semibold">
                  {user?.first_name} {user?.last_name}
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
