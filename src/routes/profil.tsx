import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { isAxiosError } from "axios";
import { ArrowRight, Building2, KeyRound, Mail, Phone } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/app-shell";
import { UserAvatar } from "@/components/shared/avatar";
import { MissionStatusBadge } from "@/components/shared/badges";
import { PushNotificationsCard } from "@/components/shared/push-notifications-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/context/auth-context";
import {
  authService,
  clientService,
  missionService,
  projectService,
  userService,
} from "@/services";
import { ROLE_LABELS } from "@/types";

export const Route = createFileRoute("/profil")({
  head: () => ({
    meta: [
      { title: "Mon profil — OLYMPE" },
      {
        name: "description",
        content: "Coordonnées, mot de passe et informations du compte connecté.",
      },
      { property: "og:title", content: "Mon profil — OLYMPE" },
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
  const isClient = user?.role === "client";
  /** Client et collaborateur : mot de passe géré par l'admin seul (refusé
   * aussi côté serveur, ChangePasswordView). */
  const canChangePassword = user?.role === "admin" || user?.role === "chef_projet";

  return (
    <AppShell title="Mon profil" subtitle={user ? ROLE_LABELS[user.role] : undefined}>
      <div className="grid items-start gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <div className="surface-card p-5">
            <div className="flex items-center gap-4">
              <UserAvatar
                user={user ?? { first_name: "", last_name: "" }}
                className="h-14 w-14 text-base"
              />
              <div className="min-w-0">
                <h2 className="truncate text-base font-semibold">
                  {user?.first_name} {user?.last_name}
                </h2>
                <p className="truncate text-xs text-muted-foreground">
                  {[user?.job_title, user ? ROLE_LABELS[user.role] : ""]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
            </div>
            <div className="mt-5 grid gap-4 border-t border-border pt-4 sm:grid-cols-2">
              <ReadField label="Prénom" value={user?.first_name} />
              <ReadField label="Nom" value={user?.last_name} />
              <ReadField label="E-mail de connexion" value={user?.email} />
              <ReadField label="Téléphone" value={user?.phone} />
              <ReadField label="Fonction" value={user?.job_title} />
            </div>
            <p className="mt-4 text-xs text-muted-foreground">
              {isClient
                ? "Pour modifier ces informations, contactez votre chef de projet."
                : "Pour modifier ces informations, contactez un administrateur."}
            </p>
          </div>

          {canChangePassword ? (
            <ChangePasswordCard />
          ) : (
            <div className="surface-card flex items-start gap-3 p-5">
              <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <div>
                <h2 className="text-sm font-semibold">Mot de passe</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Votre mot de passe est géré par l'administrateur. Pour le modifier, contactez-le
                  {isClient ? " ou votre chef de projet" : ""}.
                </p>
              </div>
            </div>
          )}

          <PushNotificationsCard />
        </div>

        {isClient ? <CompanyCard /> : <MyMissionsCard />}
      </div>
    </AppShell>
  );
}

/** L'admin choisit le mot de passe initial et le transmet (souvent par
 * message) : chacun doit pouvoir le remplacer par le sien. */
function ChangePasswordCard() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");

  const mutation = useMutation({
    mutationFn: () => authService.changePassword(current, next),
    onSuccess: () => {
      setCurrent("");
      setNext("");
      setConfirm("");
      toast.success("Mot de passe modifié. Utilisez-le dès votre prochaine connexion.");
    },
    onError: (error) => {
      const detail = isAxiosError<{ detail?: string }>(error)
        ? error.response?.data?.detail
        : undefined;
      toast.error(detail ?? "Modification impossible.");
    },
  });

  const tooShort = next.length > 0 && next.length < 8;
  const mismatch = confirm.length > 0 && next !== confirm;
  const canSubmit = current && next.length >= 8 && next === confirm && !mutation.isPending;

  return (
    <form
      className="surface-card p-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (canSubmit) mutation.mutate();
      }}
    >
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <KeyRound className="h-4 w-4 text-primary" /> Changer mon mot de passe
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Si votre mot de passe vous a été communiqué par l'agence, remplacez-le par un mot de passe
        personnel.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="current-password" className="text-xs">
            Mot de passe actuel
          </Label>
          <Input
            id="current-password"
            type="password"
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="new-password" className="text-xs">
            Nouveau mot de passe
          </Label>
          <Input
            id="new-password"
            type="password"
            autoComplete="new-password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
          />
          {tooShort && <p className="text-xs text-destructive">8 caractères minimum.</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="confirm-password" className="text-xs">
            Confirmer
          </Label>
          <Input
            id="confirm-password"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
          {mismatch && (
            <p className="text-xs text-destructive">Les deux mots de passe ne correspondent pas.</p>
          )}
        </div>
      </div>
      <div className="mt-4 flex justify-end">
        <Button type="submit" disabled={!canSubmit}>
          {mutation.isPending ? "Enregistrement..." : "Changer le mot de passe"}
        </Button>
      </div>
    </form>
  );
}

/** Pour un client : son entreprise et son interlocuteur à l'agence (le chef
 * de projet de son projet en cours), au lieu d'une liste de missions
 * "assignées" qui ne le concerne pas. */
function CompanyCard() {
  const { user } = useAuth();
  const { data: clients } = useQuery({ queryKey: ["clients"], queryFn: clientService.list });
  const { data: projects } = useQuery({ queryKey: ["projects"], queryFn: projectService.list });
  const { data: users } = useQuery({ queryKey: ["users"], queryFn: userService.list });

  const company = clients?.find((c) => c.id === user?.client_id);
  const currentProject = (projects ?? []).find(
    (p) => p.client_id === user?.client_id && p.status !== "archive",
  );
  const referent = users?.find((u) => u.id === currentProject?.owner_id);

  return (
    <div className="surface-card space-y-4 p-5">
      <div>
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Building2 className="h-4 w-4 text-primary" /> Votre entreprise
        </h2>
        <p className="mt-2 text-base font-semibold">{company?.name ?? "—"}</p>
        {company?.industry && company.industry !== "Non renseigné" && (
          <p className="text-xs text-muted-foreground">{company.industry}</p>
        )}
      </div>

      {referent && (
        <div className="border-t border-border pt-4">
          <p className="text-xs text-muted-foreground">Votre chef de projet</p>
          <div className="mt-2 flex items-center gap-3">
            <UserAvatar user={referent} className="h-9 w-9 text-xs" />
            <p className="text-sm font-medium">
              {referent.first_name} {referent.last_name}
            </p>
          </div>
          <div className="mt-2 space-y-1 text-xs text-muted-foreground">
            <p className="flex items-center gap-2">
              <Mail className="h-3.5 w-3.5" /> {referent.email}
            </p>
            {referent.phone && (
              <p className="flex items-center gap-2">
                <Phone className="h-3.5 w-3.5" /> {referent.phone}
              </p>
            )}
          </div>
        </div>
      )}

      <Link
        to="/portail"
        className="inline-flex items-center gap-1 border-t border-border pt-4 text-sm font-medium text-primary hover:underline"
      >
        Voir mes projets et livrables <ArrowRight className="h-4 w-4" />
      </Link>
    </div>
  );
}

function MyMissionsCard() {
  const { user } = useAuth();
  const { data: missions } = useQuery({ queryKey: ["missions"], queryFn: missionService.list });
  const mine = (missions ?? []).filter(
    (m) => m.assignee_id === user?.id || m.collaborators.includes(user?.id ?? ""),
  );

  return (
    <div className="surface-card p-5">
      <h2 className="text-sm font-semibold">Mes missions ({mine.length})</h2>
      <ul className="mt-3 space-y-2">
        {mine.slice(0, 6).map((m) => (
          <li key={m.id}>
            <Link
              to="/missions/$missionId"
              params={{ missionId: m.id }}
              className="flex items-center gap-2 text-xs hover:text-primary"
            >
              <span className="min-w-0 flex-1 truncate">{m.title}</span>
              <MissionStatusBadge status={m.status} />
            </Link>
          </li>
        ))}
        {mine.length === 0 && (
          <li className="text-xs text-muted-foreground">Aucune mission assignée.</li>
        )}
      </ul>
    </div>
  );
}
