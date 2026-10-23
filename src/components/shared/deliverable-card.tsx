import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  CheckCircle2,
  Eye,
  FileArchive,
  FileText,
  Film,
  ImageIcon,
  LinkIcon,
  Megaphone,
  Pencil,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
  DeliverableStateBadge,
  awaitsCorrectedVersion,
  canTogglePublication,
  deliverableBorderTone,
  deliverableRowTone,
  deliverableState,
  hasDeliverableLink,
  isSentToClient,
} from "@/components/shared/badges";
import { DeliverableDecision } from "@/components/shared/deliverable-decision";
import { actionBar, actionChip, actionLabel } from "@/components/shared/action-chip";
import { DeliverableFeedback } from "@/components/shared/deliverable-feedback";
import { ScheduleButton, ScheduledLine } from "@/components/shared/deliverable-schedule";
import { ConfirmDeleteButton } from "@/components/shared/edit-dialogs";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/auth-context";
import { errorMessage } from "@/lib/api";
import { cn } from "@/lib/utils";
import { deliverableService } from "@/services";
import type { Deliverable, DeliverableType, Mission } from "@/types";

/**
 * Livrable côté agence, en un seul endroit : droits, actions (mêmes
 * messages, mêmes rafraîchissements) et carte. Utilisé par la fiche mission,
 * la page Livrables et la fiche client, pour qu'une évolution ou une
 * correction s'applique partout à la fois. Le serveur (DeliverablePermission)
 * reste la source de vérité des droits ; ceux-ci ne servent qu'à n'afficher
 * que les actions possibles.
 */

export const DELIVERABLE_TYPE_ICON: Record<DeliverableType, typeof FileText> = {
  pdf: FileText,
  image: ImageIcon,
  zip: FileArchive,
  video: Film,
  lien: LinkIcon,
};

/** Qui peut quoi sur un livrable (côté agence). */
export function useDeliverablePermissions() {
  const { user, hasRole } = useAuth();
  const isManager = hasRole("admin", "chef_projet");
  return {
    /** Validation agence (envoi au client) et décision pour le client. */
    canValidate: isManager,
    /** Publier / dépublier : l'agence ; un collaborateur ne voit que les
     * livrables de ses missions (portée imposée par le serveur). */
    canPublish: isManager || hasRole("collaborateur"),
    /** Nom / lien et suppression : admin, chef de projet, ou l'auteur. */
    canManage: (d: Deliverable) =>
      isManager || (hasRole("collaborateur") && d.uploaded_by === user?.id),
  };
}

/** Actions sur un livrable, avec rafraîchissement des livrables et des
 * missions (le statut d'une mission suit ses livrables côté serveur). */
export function useDeliverableActions() {
  const qc = useQueryClient();
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["deliverables"] });
    void qc.invalidateQueries({ queryKey: ["missions"] });
  };

  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: Deliverable["status"] }) =>
      deliverableService.updateStatus(id, status),
    onSuccess: (_d, { status }) => {
      refresh();
      toast.success(
        status === "valide"
          ? "Livrable validé et envoyé au client."
          : status === "corrections"
            ? "Corrections demandées à l'équipe."
            : "Envoi au client retiré.",
      );
    },
    onError: (error) => toast.error(errorMessage(error, "Mise à jour du statut impossible.")),
  });

  const setPublished = useMutation({
    mutationFn: ({ id, published }: { id: string; published: boolean }) =>
      deliverableService.setPublished(id, published),
    onSuccess: (_d, { published }) => {
      refresh();
      toast.success(published ? "Livrable marqué comme publié." : "Publication annulée.");
    },
    onError: (error) =>
      toast.error(errorMessage(error, "Mise à jour de la publication impossible.")),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deliverableService.remove(id),
    onSuccess: () => {
      refresh();
      toast.success("Livrable supprimé.");
    },
    onError: (error) => toast.error(errorMessage(error, "Suppression impossible.")),
  });

  return { setStatus, setPublished, remove };
}

/**
 * Actions d'un livrable, toujours dans le même ordre : envoyer au client
 * (✓), décision pour le client, programmer (📅), publier, ouvrir, modifier,
 * supprimer. Seules les actions possibles (état + droits) apparaissent.
 * Icônes sur ordinateur, boutons nommés sur téléphone ; supprimer demande
 * une confirmation.
 */
export function DeliverableActions({
  deliverable: d,
  onEdit,
  allowDelete = true,
}: {
  deliverable: Deliverable;
  onEdit: (d: Deliverable) => void;
  allowDelete?: boolean;
}) {
  const { canValidate, canPublish, canManage } = useDeliverablePermissions();
  const { setStatus, setPublished, remove } = useDeliverableActions();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const sent = d.status === "valide";

  return (
    <div className={actionBar}>
      {/* Envoyer / retirer l'envoi : sans objet une fois publié ou quand le
          client attend une version corrigée. */}
      {canValidate && hasDeliverableLink(d) && !d.published_at && !awaitsCorrectedVersion(d) && (
        <button
          type="button"
          onClick={() => setStatus.mutate({ id: d.id, status: sent ? "en_attente" : "valide" })}
          disabled={setStatus.isPending}
          aria-label={sent ? `Retirer l'envoi de ${d.name}` : `Valider et envoyer ${d.name}`}
          title={
            sent
              ? "Validé et envoyé au client — cliquer pour retirer"
              : "Valider et envoyer au client"
          }
          className={cn(actionChip, "hover:text-success", sent && "text-success")}
        >
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span className={actionLabel}>{sent ? "Retirer l'envoi" : "Envoyer au client"}</span>
        </button>
      )}
      {/* Réponse du client reçue hors du portail (ou changement d'avis). */}
      {canValidate && isSentToClient(d) && (
        <DeliverableDecision deliverable={d} onBehalf variant="icons" />
      )}
      {canPublish && !d.published_at && <ScheduleButton deliverable={d} />}
      {canPublish && canTogglePublication(d) && (
        <button
          type="button"
          onClick={() => setPublished.mutate({ id: d.id, published: !d.published_at })}
          disabled={setPublished.isPending}
          aria-label={d.published_at ? `Annuler la publication de ${d.name}` : `Publier ${d.name}`}
          title={d.published_at ? "Publié — cliquer pour annuler" : "Marquer comme publié"}
          className={cn(actionChip, "hover:text-primary", d.published_at && "text-primary")}
        >
          <Megaphone className="h-4 w-4 shrink-0" />
          <span className={actionLabel}>{d.published_at ? "Dépublier" : "Publier"}</span>
        </button>
      )}
      {hasDeliverableLink(d) && (
        <a
          href={d.url}
          target="_blank"
          rel="noreferrer"
          aria-label={`Ouvrir ${d.name}`}
          title="Ouvrir"
          className={cn(actionChip, "hover:text-primary")}
        >
          <Eye className="h-4 w-4 shrink-0" />
          <span className={actionLabel}>Ouvrir</span>
        </a>
      )}
      {canManage(d) && (
        <button
          type="button"
          onClick={() => onEdit(d)}
          aria-label={`Modifier ${d.name}`}
          title={hasDeliverableLink(d) ? "Modifier" : "Ajouter le lien"}
          className={cn(actionChip, "hover:text-primary")}
        >
          <Pencil className="h-4 w-4 shrink-0" />
          <span className={actionLabel}>
            {hasDeliverableLink(d) ? "Modifier" : "Ajouter le lien"}
          </span>
        </button>
      )}
      {allowDelete && canManage(d) && (
        <>
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            disabled={remove.isPending}
            aria-label={`Supprimer ${d.name}`}
            title="Supprimer"
            className={cn(actionChip, "hover:text-destructive")}
          >
            <Trash2 className="h-4 w-4 shrink-0" />
            <span className={actionLabel}>Supprimer</span>
          </button>
          <ConfirmDeleteButton
            open={confirmDelete}
            onOpenChange={setConfirmDelete}
            title={`Supprimer « ${d.name} » ?`}
            description="Le livrable et son historique de validation seront supprimés définitivement. Cette action est irréversible."
            pending={remove.isPending}
            onConfirm={() => remove.mutate(d.id, { onSuccess: () => setConfirmDelete(false) })}
          />
        </>
      )}
    </div>
  );
}

/** Nom et version (ou "Lien pas encore disponible"). */
export function DeliverableTitle({ deliverable: d }: { deliverable: Deliverable }) {
  return (
    <>
      <p className="line-clamp-2 text-sm font-medium [overflow-wrap:anywhere]">{d.name}</p>
      <p className="text-[11px] text-muted-foreground">
        {hasDeliverableLink(d) ? `v${d.version}` : "Lien pas encore disponible"}
      </p>
    </>
  );
}

/**
 * Carte d'un livrable côté agence. En-tête : icône, nom et version, état et
 * sa trace dessous (à côté, une trace longue écrasait le nom), actions à
 * droite qui passent sous le nom quand la place manque. Puis la demande de
 * corrections du client, et selon la vue la mission, l'auteur et les
 * boutons de revue.
 */
export function DeliverableCard({
  deliverable: d,
  onEdit,
  mission,
  authorName,
  allowDelete = true,
  showReviewButtons = false,
  highlighted = false,
  id,
  className,
}: {
  deliverable: Deliverable;
  onEdit: (d: Deliverable) => void;
  /** Lien vers la mission (vues qui mélangent plusieurs missions). */
  mission?: Mission | undefined;
  /** "Déposé par … le …". */
  authorName?: string | undefined;
  allowDelete?: boolean;
  /** Grands boutons "Valider et envoyer" / "Corrections" pour un livrable en
   * revue agence (page Livrables, où la revue est la tâche principale). */
  showReviewButtons?: boolean;
  highlighted?: boolean;
  id?: string;
  className?: string;
}) {
  const { canValidate, canManage } = useDeliverablePermissions();
  const { setStatus } = useDeliverableActions();
  const state = deliverableState(d);
  const Icon = DELIVERABLE_TYPE_ICON[d.type];
  const inAgencyReview =
    canValidate &&
    hasDeliverableLink(d) &&
    !d.published_at &&
    !awaitsCorrectedVersion(d) &&
    !isSentToClient(d);

  return (
    <div
      id={id}
      className={cn(
        "min-w-0 scroll-mt-24 rounded-lg border border-l-4 border-border p-3 transition-shadow duration-500",
        deliverableRowTone[state],
        deliverableBorderTone[state],
        highlighted && "ring-2 ring-primary ring-offset-2 ring-offset-background",
        className,
      )}
    >
      <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
        <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <div className="min-w-[8rem] flex-1">
          <DeliverableTitle deliverable={d} />
          {/* Le bloc "À corriger" dessous dit déjà l'état. */}
          {!awaitsCorrectedVersion(d) && (
            <div className="mt-1.5">
              <DeliverableStateBadge deliverable={d} />
            </div>
          )}
          <ScheduledLine deliverable={d} className="mt-1" />
        </div>
        <div className="w-full sm:ml-auto sm:w-auto">
          <DeliverableActions deliverable={d} onEdit={onEdit} allowDelete={allowDelete} />
        </div>
      </div>

      <DeliverableFeedback
        deliverable={d}
        className="mt-3"
        onFix={canManage(d) ? () => onEdit(d) : undefined}
      />

      {(mission || authorName) && (
        <div className="mt-2 space-y-0.5">
          {mission && (
            <Link
              to="/missions/$missionId"
              params={{ missionId: mission.id }}
              className="block truncate text-sm text-primary hover:underline"
            >
              {mission.title}
            </Link>
          )}
          {authorName && (
            <p className="text-xs text-muted-foreground">
              Déposé par {authorName} le {new Date(d.created_at).toLocaleDateString("fr-FR")}
            </p>
          )}
        </div>
      )}

      {showReviewButtons && inAgencyReview && (
        <div className="mt-3 flex gap-2 border-t border-border pt-3">
          <Button
            size="sm"
            className="flex-1"
            disabled={setStatus.isPending}
            onClick={() => setStatus.mutate({ id: d.id, status: "valide" })}
          >
            Valider et envoyer
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="flex-1"
            disabled={d.status === "corrections" || setStatus.isPending}
            onClick={() => setStatus.mutate({ id: d.id, status: "corrections" })}
          >
            Corrections
          </Button>
        </div>
      )}
    </div>
  );
}
