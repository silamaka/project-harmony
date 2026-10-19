import { useMutation, useQueryClient } from "@tanstack/react-query";
import { KeyRound } from "lucide-react";
import { toast } from "sonner";
import { UserAvatar } from "@/components/shared/avatar";
import { CreateUserDialog, EditUserDialog } from "@/components/shared/create-dialogs";
import { ConfirmDeleteButton } from "@/components/shared/edit-dialogs";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { userService } from "@/services";
import type { User } from "@/types";

/**
 * Comptes qui donnent accès au portail pour une entreprise cliente (onglet
 * "Accès portail" de la fiche client, admin uniquement — comme côté
 * serveur, UserWritePermission). Le client se connecte comme tout le
 * monde (e-mail + mot de passe choisis par l'admin, qui les lui transmet)
 * et arrive sur son portail. Plusieurs contacts par entreprise possibles.
 */
export function ClientPortalAccess({
  clientId,
  clientName,
  users,
}: {
  clientId: string;
  clientName: string;
  users: User[];
}) {
  const qc = useQueryClient();
  const accounts = users
    .filter((u) => u.role === "client" && u.client_id === clientId)
    .sort((a, b) =>
      `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`),
    );

  const refresh = () => void qc.invalidateQueries({ queryKey: ["users"] });

  const toggleActive = useMutation({
    mutationFn: (id: string) => userService.toggleActive(id),
    onSuccess: (u) => {
      refresh();
      toast.success(
        u.is_active ? "Accès réactivé." : "Accès désactivé : il ne peut plus se connecter.",
      );
    },
    onError: () => toast.error("Changement impossible."),
  });

  const remove = useMutation({
    mutationFn: (id: string) => userService.remove(id),
    onSuccess: () => {
      refresh();
      toast.success("Accès supprimé. L'entreprise et ses missions sont conservées.");
    },
    onError: () => toast.error("Suppression impossible."),
  });

  return (
    <div className="surface-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <KeyRound className="h-4 w-4 text-primary" /> Accès au portail client
          </h2>
          <p className="mt-1 max-w-xl text-xs text-muted-foreground">
            Chaque personne de {clientName} qui doit suivre ses projets a son propre compte. Elle se
            connecte avec son e-mail et le mot de passe que vous lui transmettez, et ne voit que les
            projets et missions de {clientName}.
          </p>
        </div>
        <CreateUserDialog
          role="client"
          lockRole
          clientId={clientId}
          triggerLabel="Créer un accès"
        />
      </div>

      {accounts.length === 0 ? (
        <p className="mt-6 rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
          Aucun accès pour le moment. Créez-en un pour que {clientName} puisse se connecter à son
          portail.
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-border">
          {accounts.map((u) => (
            <li key={u.id} className="flex flex-wrap items-center gap-3 py-3">
              <UserAvatar user={u} className="h-9 w-9 text-xs" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {u.first_name} {u.last_name}
                  {u.job_title && (
                    <span className="font-normal text-muted-foreground"> · {u.job_title}</span>
                  )}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {u.email}
                  {u.phone && ` · ${u.phone}`}
                </p>
              </div>
              <span
                className={cn(
                  "rounded-full px-2.5 py-0.5 text-xs font-semibold",
                  u.is_active ? "bg-success/15 text-success" : "bg-muted text-muted-foreground",
                )}
              >
                {u.is_active ? "Actif" : "Désactivé"}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={toggleActive.isPending}
                  onClick={() => toggleActive.mutate(u.id)}
                >
                  {u.is_active ? "Désactiver" : "Réactiver"}
                </Button>
                <EditUserDialog user={u} />
                <ConfirmDeleteButton
                  iconOnly
                  title={`Supprimer l'accès de ${u.first_name} ${u.last_name} ?`}
                  description={`Cette personne ne pourra plus se connecter. ${clientName}, ses projets et ses missions sont conservés.`}
                  pending={remove.isPending && remove.variables === u.id}
                  onConfirm={() => remove.mutate(u.id)}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
