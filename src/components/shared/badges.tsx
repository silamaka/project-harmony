import { cn } from "@/lib/utils";
import {
  MISSION_STATUS_LABELS,
  PRIORITY_LABELS,
  PROJECT_STATUS_LABELS,
  type Deliverable,
  type MissionStatus,
  type Priority,
  type ProjectStatus,
} from "@/types";

const base =
  "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap";

export const missionTone: Record<MissionStatus, string> = {
  a_faire: "bg-muted text-muted-foreground",
  en_cours: "bg-primary/10 text-primary",
  livrable_depose: "bg-info/15 text-info",
  validation_interne: "bg-warning/20 text-warning",
  envoye_client: "bg-accent text-accent-foreground",
  valide: "bg-success/15 text-success",
  corrections: "bg-destructive/12 text-destructive",
  publie: "bg-secondary text-secondary-foreground",
  termine: "bg-success/20 text-success",
};

export function MissionStatusBadge({ status }: { status: MissionStatus }) {
  return <span className={cn(base, missionTone[status])}>{MISSION_STATUS_LABELS[status]}</span>;
}

export const projectTone: Record<ProjectStatus, string> = {
  brouillon: "bg-muted text-muted-foreground",
  en_preparation: "bg-info/15 text-info",
  en_cours: "bg-primary/10 text-primary",
  en_attente: "bg-warning/20 text-warning",
  termine: "bg-success/15 text-success",
  archive: "bg-muted text-muted-foreground",
};

export function ProjectStatusBadge({ status }: { status: ProjectStatus }) {
  return <span className={cn(base, projectTone[status])}>{PROJECT_STATUS_LABELS[status]}</span>;
}

/**
 * État unique d'un livrable, combinant lien, les deux validations (agence
 * puis client) et publication, dans l'ordre du circuit réel : Lien à venir →
 * En revue agence → Chez le client → Prêt à publier → Publié, avec
 * Corrections quand l'agence ou le client en demande. La publication
 * l'emporte (un livrable en ligne est "Publié"), même non validé :
 * `DeliverableStateBadge` le signale alors à part. Le client ne reçoit que
 * des livrables validés par l'agence : il ne voit jamais "a_venir" ni
 * "en_attente".
 */
export type DeliverableState =
  "a_venir" | "en_attente" | "corrections" | "envoye" | "pret" | "publie";

export const DELIVERABLE_STATES: DeliverableState[] = [
  "a_venir",
  "en_attente",
  "corrections",
  "envoye",
  "pret",
  "publie",
];

/** Le livrable a-t-il déjà un lien (sinon il est seulement annoncé) ? */
export const hasDeliverableLink = (d: Pick<Deliverable, "url">) => !!d.url?.trim();

type DeliverableStateFields = Pick<
  Deliverable,
  | "status"
  | "client_status"
  | "published_at"
  | "url"
  | "client_validated_at"
  | "client_decided_by_name"
>;

export function deliverableState(d: DeliverableStateFields): DeliverableState {
  if (!hasDeliverableLink(d)) return "a_venir";
  if (d.published_at) return "publie";
  if (d.status !== "valide") return d.status === "corrections" ? "corrections" : "en_attente";
  if (d.client_status === "corrections") return "corrections";
  if (d.client_status === "valide") return "pret";
  return "envoye";
}

/** Livrable envoyé au client (validé par l'agence) et pas encore publié :
 * sa décision compte encore, et l'agence peut l'enregistrer pour lui
 * (réponse reçue hors du portail), qu'il attende, soit en corrections ou
 * déjà validé (le client a changé d'avis). */
export const isSentToClient = (d: DeliverableStateFields) =>
  hasDeliverableLink(d) && !d.published_at && d.status === "valide";

/** Le client a demandé des corrections sur un livrable envoyé : la seule
 * suite possible côté agence est une version corrigée (nouveau lien), qui
 * remet le livrable en revue. Valider / renvoyer n'a alors plus de sens. */
export const awaitsCorrectedVersion = (d: DeliverableStateFields) =>
  hasDeliverableLink(d) &&
  !d.published_at &&
  d.status === "valide" &&
  d.client_status === "corrections";

export const DELIVERABLE_STATE_LABELS: Record<DeliverableState, string> = {
  a_venir: "Lien à venir",
  en_attente: "En revue agence",
  corrections: "Corrections",
  envoye: "Chez le client",
  pret: "Prêt à publier",
  publie: "Publié",
};

/** Pastille (fond + texte) — mêmes teintes que les statuts de mission. */
export const deliverableTone: Record<DeliverableState, string> = {
  a_venir: "bg-muted text-muted-foreground",
  en_attente: "bg-warning/20 text-warning",
  corrections: "bg-destructive/12 text-destructive",
  envoye: "bg-info/15 text-info",
  pret: "bg-primary/10 text-primary",
  publie: "bg-success/15 text-success",
};

/** Fond de ligne (tableau) et liseré gauche (cartes) pour le même état. */
export const deliverableRowTone: Record<DeliverableState, string> = {
  a_venir: "bg-muted/40",
  en_attente: "bg-warning/12",
  corrections: "bg-destructive/8",
  envoye: "bg-info/8",
  pret: "bg-primary/8",
  publie: "bg-success/10",
};

export const deliverableBorderTone: Record<DeliverableState, string> = {
  a_venir: "border-dashed border-l-muted-foreground/50",
  en_attente: "border-l-warning",
  corrections: "border-l-destructive",
  envoye: "border-l-info",
  pret: "border-l-primary",
  publie: "border-l-success",
};

/** Côté client, "À valider" est une action attendue de lui : même jaune que
 * le statut de mission "À valider" et le bandeau "À vous de jouer". Côté
 * agence, "Chez le client" reste bleu (rien à faire pour elle). */
const clientDeliverableTone: Record<DeliverableState, string> = {
  ...deliverableTone,
  envoye: "bg-warning/20 text-warning",
};

export const clientDeliverableBorderTone: Record<DeliverableState, string> = {
  ...deliverableBorderTone,
  envoye: "border-l-warning",
};

/** Mêmes états, formulés pour le client (ce qu'on attend de lui). */
export const CLIENT_DELIVERABLE_STATE_LABELS: Record<DeliverableState, string> = {
  a_venir: "Lien à venir",
  en_attente: "En préparation",
  corrections: "Corrections demandées",
  envoye: "À valider",
  pret: "Validé",
  publie: "Publié",
};

export function DeliverableStateBadge({
  deliverable,
  audience = "agence",
  showPublishedDate = true,
}: {
  deliverable: DeliverableStateFields;
  audience?: "agence" | "client";
  /** false quand la date de publication est déjà affichée ailleurs (ligne d'info). */
  showPublishedDate?: boolean;
}) {
  const state = deliverableState(deliverable);
  const labels = audience === "client" ? CLIENT_DELIVERABLE_STATE_LABELS : DELIVERABLE_STATE_LABELS;
  const tones = audience === "client" ? clientDeliverableTone : deliverableTone;
  return (
    <span className="inline-flex flex-col items-start gap-0.5">
      <span className={cn(base, tones[state])}>{labels[state]}</span>
      {showPublishedDate && deliverable.published_at && (
        <span className="text-[11px] text-muted-foreground">
          le {new Date(deliverable.published_at).toLocaleDateString("fr-FR")}
          {audience === "agence" &&
            (deliverable.status !== "valide" || deliverable.client_status !== "valide") && (
              <span className="font-medium text-warning"> · non validé</span>
            )}
        </span>
      )}
      {/* L'agence voit qui a validé et quand : "Prêt à publier" seul ne le dit pas.
          Vert atténué : une trace, pas un état (différent du vert de "Publié"). */}
      {audience === "agence" &&
        deliverable.client_status === "valide" &&
        deliverable.client_validated_at && (
          <span className="text-[11px] text-success/70">
            {deliverable.client_decided_by_name
              ? `Validé pour le client par ${deliverable.client_decided_by_name} le `
              : "Validé par le client le "}
            {new Date(deliverable.client_validated_at).toLocaleDateString("fr-FR")}
          </span>
        )}
    </span>
  );
}

/**
 * Statut d'une mission tel que le client le voit : le circuit interne de
 * l'agence (À faire, En cours, Livrable déposé, Validation interne) se
 * résume pour lui à "En préparation" ; seule compte sa propre étape.
 */
export type ClientMissionStatus =
  "preparation" | "a_valider" | "corrections" | "valide" | "publie" | "termine";

export function clientMissionStatus(status: MissionStatus): ClientMissionStatus {
  switch (status) {
    case "envoye_client":
      return "a_valider";
    case "corrections":
      return "corrections";
    case "valide":
      return "valide";
    case "publie":
      return "publie";
    case "termine":
      return "termine";
    default:
      return "preparation";
  }
}

const CLIENT_MISSION_STATUS_LABELS: Record<ClientMissionStatus, string> = {
  preparation: "En préparation",
  a_valider: "À valider",
  corrections: "Corrections en cours",
  valide: "Validé",
  publie: "Publié",
  termine: "Terminé",
};

const clientMissionTone: Record<ClientMissionStatus, string> = {
  preparation: "bg-primary/10 text-primary",
  a_valider: "bg-warning/20 text-warning",
  corrections: "bg-destructive/12 text-destructive",
  valide: "bg-success/15 text-success",
  publie: "bg-success/15 text-success",
  termine: "bg-success/20 text-success",
};

export function ClientMissionStatusBadge({ status }: { status: MissionStatus }) {
  const s = clientMissionStatus(status);
  return <span className={cn(base, clientMissionTone[s])}>{CLIENT_MISSION_STATUS_LABELS[s]}</span>;
}

export const priorityTone: Record<Priority, string> = {
  faible: "bg-muted text-muted-foreground",
  normale: "bg-info/15 text-info",
  haute: "bg-warning/20 text-warning",
  urgente: "bg-destructive text-destructive-foreground",
};

export function PriorityBadge({ priority }: { priority: Priority }) {
  return <span className={cn(base, priorityTone[priority])}>{PRIORITY_LABELS[priority]}</span>;
}
