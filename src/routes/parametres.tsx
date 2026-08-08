import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Moon, Sun } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { CreateUserDialog, EditUserDialog } from "@/components/shared/create-dialogs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useTheme } from "@/hooks/use-theme";
import { API_BASE_URL } from "@/lib/api";
import { userService } from "@/services";
import { ROLE_LABELS } from "@/types";

export const Route = createFileRoute("/parametres")({
  head: () => ({
    meta: [
      { title: "Paramètres — BEBA EMPIRE" },
      {
        name: "description",
        content: "Administration : utilisateurs, rôles, préférences d'affichage et connexion API.",
      },
      { property: "og:title", content: "Paramètres — BEBA EMPIRE" },
      { property: "og:description", content: "Réglages administrateur de la plateforme." },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const { theme, toggle } = useTheme();
  const { data: users } = useQuery({ queryKey: ["users"], queryFn: userService.list });

  return (
    <AppShell
      title="Paramètres"
      subtitle="Administration de la plateforme"
      allow={["admin"]}
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="surface-card p-5">
          <h2 className="text-sm font-semibold">Apparence</h2>
          <div className="mt-4 flex items-center justify-between gap-4">
            <div>
              <Label className="text-sm">Mode sombre</Label>
              <p className="text-xs text-muted-foreground">
                Bascule le thème clair / sombre de l'interface.
              </p>
            </div>
            <div className="flex items-center gap-2">
              {theme === "dark" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
              <Switch checked={theme === "dark"} onCheckedChange={toggle} />
            </div>
          </div>
        </div>

        <div className="surface-card p-5">
          <h2 className="text-sm font-semibold">Connexion API</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            URL de base de l'API Django REST Framework (variable VITE_API_URL).
          </p>
          <div className="mt-4 space-y-2">
            <Label htmlFor="api-url" className="text-xs">
              Base URL
            </Label>
            <Input id="api-url" value={API_BASE_URL} readOnly />
          </div>
        </div>
      </div>

      <div className="surface-card mt-4 p-5">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="min-w-0 flex-1 text-sm font-semibold">Utilisateurs et rôles</h2>
          <CreateUserDialog triggerLabel="Inviter un utilisateur" />
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                <th className="py-2 font-medium">Nom</th>
                <th className="py-2 font-medium">Email</th>
                <th className="py-2 font-medium">Rôle</th>
                <th className="py-2 font-medium">Statut</th>
                <th className="py-2 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(users ?? []).map((u) => (
                <tr key={u.id} className="border-b border-border/60 last:border-0">
                  <td className="py-2.5 font-medium">
                    {u.first_name} {u.last_name}
                  </td>
                  <td className="py-2.5 text-muted-foreground">{u.email}</td>
                  <td className="py-2.5">{ROLE_LABELS[u.role]}</td>
                  <td className="py-2.5">
                    <span
                      className={
                        u.is_active
                          ? "rounded-full bg-success/15 px-2.5 py-0.5 text-xs font-semibold text-success"
                          : "rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold text-muted-foreground"
                      }
                    >
                      {u.is_active ? "Actif" : "Inactif"}
                    </span>
                  </td>
                  <td className="py-2.5 text-right">
                    <EditUserDialog user={u} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}
