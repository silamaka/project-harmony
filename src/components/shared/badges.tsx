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
 * État unique d'un livrable, combinant lien, validation et publication
 * dans l'ordre du circuit réel : Lien à venir → Corrections → En attente →
 * Prêt à publier → Publié. La publication l'emporte (un livrable en ligne
 * est "Publié"), même non validé : `DeliverableStateBadge` le signale alors
 * à part. Sans lien, le livrable est seulement annoncé ("Lien à venir").
 */
export type DeliverableState = "a_venir" | "corrections" | "en_attente" | "pret" | "publie";

export const DELIVERABLE_STATES: DeliverableState[] = [
  "a_venir",
  "corrections",
  "en_attente",
  "pret",
  "publie",
];

/** Le livrable a-t-il déjà un lien (sinon il est seulement annoncé) ? */
export const hasDeliverableLink = (d: Pick<Deliverable, "url">) => !!d.url?.trim();

export function deliverableState(
  d: Pick<Deliverable, "status" | "published_at" | "url">,
): DeliverableState {
  if (!hasDeliverableLink(d)) return "a_venir";
  if (d.published_at) return "publie";
  if (d.status === "corrections") return "corrections";
  if (d.status === "valide") return "pret";
  return "en_attente";
}

export const DELIVERABLE_STATE_LABELS: Record<DeliverableState, string> = {
  a_venir: "Lien à venir",
  corrections: "Corrections",
  en_attente: "En attente",
  pret: "Prêt à publier",
  publie: "Publié",
};

/** Pastille (fond + texte) — mêmes teintes que les statuts de mission. */
export const deliverableTone: Record<DeliverableState, string> = {
  a_venir: "bg-muted text-muted-foreground",
  corrections: "bg-destructive/12 text-destructive",
  en_attente: "bg-warning/20 text-warning",
  pret: "bg-primary/10 text-primary",
  publie: "bg-success/15 text-success",
};

/** Fond de ligne (tableau) et liseré gauche (cartes) pour le même état. */
export const deliverableRowTone: Record<DeliverableState, string> = {
  a_venir: "bg-muted/40",
  corrections: "bg-destructive/8",
  en_attente: "bg-warning/12",
  pret: "bg-primary/8",
  publie: "bg-success/10",
};

export const deliverableBorderTone: Record<DeliverableState, string> = {
  a_venir: "border-dashed border-l-muted-foreground/50",
  corrections: "border-l-destructive",
  en_attente: "border-l-warning",
  pret: "border-l-primary",
  publie: "border-l-success",
};

export function DeliverableStateBadge({
  deliverable,
}: {
  deliverable: Pick<Deliverable, "status" | "published_at" | "url">;
}) {
  const state = deliverableState(deliverable);
  return (
    <span className="inline-flex flex-col items-start gap-0.5">
      <span className={cn(base, deliverableTone[state])}>{DELIVERABLE_STATE_LABELS[state]}</span>
      {deliverable.published_at && (
        <span className="text-[11px] text-muted-foreground">
          le {new Date(deliverable.published_at).toLocaleDateString("fr-FR")}
          {deliverable.status !== "valide" && (
            <span className="font-medium text-warning"> · non validé</span>
          )}
        </span>
      )}
    </span>
  );
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
