import { ExternalLink } from "lucide-react";
import {
  DeliverableStateBadge,
  clientDeliverableBorderTone,
  deliverableState,
  hasDeliverableLink,
  type DeliverableState,
} from "@/components/shared/badges";
import { DeliverableDecision } from "@/components/shared/deliverable-decision";
import { DeliverableFeedback } from "@/components/shared/deliverable-feedback";
import { ScheduledLine } from "@/components/shared/deliverable-schedule";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Deliverable } from "@/types";

/** Ce qui attend le client d'abord, puis ce que l'agence corrige, puis
 * l'historique ; à état égal, le plus récent en premier. */
const SORT_ORDER: DeliverableState[] = [
  "envoye",
  "corrections",
  "pret",
  "publie",
  "en_attente",
  "a_venir",
];

const formatDate = (iso: string) => new Date(iso).toLocaleDateString("fr-FR");

/** Ligne d'info sous le nom. L'étiquette dit au client ce qu'on attend de
 * lui ("À valider") ; ici, le contexte : l'agence l'a déjà contrôlé (ce qui
 * n'a de sens que tant qu'il doit décider), la date de publication, la
 * version corrigée. */
function metaLine(d: Deliverable) {
  const parts: string[] = [];
  const state = deliverableState(d);
  if (state === "envoye") parts.push("Validé par l'agence");
  if (state === "pret" && d.client_decided_by_name && d.client_validated_at)
    parts.push(`Validé en votre nom par l'agence le ${formatDate(d.client_validated_at)}`);
  if (state === "publie" && d.published_at) parts.push(`Publié le ${formatDate(d.published_at)}`);
  parts.push(`${parts.length ? "envoyé" : "Envoyé"} le ${formatDate(d.created_at)}`);
  if (d.version > 1) parts.push(`version corrigée (v${d.version})`);
  return parts.join(" · ");
}

/**
 * Livrables d'une mission vus par le client (fiche mission) : c'est la raison
 * de sa visite, d'où la pleine largeur, juste sous "À vous de jouer". Chaque
 * ligne suit l'ordre de ce qu'il a à faire : lire l'état, Ouvrir, puis
 * Valider / Corrections. Le backend ne lui renvoie que les livrables validés
 * par l'agence (et ses propres dépôts, sans décision possible).
 */
export function ClientMissionDeliverables({
  deliverables,
  userId,
  highlightedId,
}: {
  deliverables: Deliverable[];
  userId: string | undefined;
  highlightedId: string | null;
}) {
  const awaits = (d: Deliverable) => d.uploaded_by !== userId && deliverableState(d) === "envoye";
  const toReview = deliverables.filter(awaits).length;
  const list = [...deliverables].sort(
    (a, b) =>
      SORT_ORDER.indexOf(deliverableState(a)) - SORT_ORDER.indexOf(deliverableState(b)) ||
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );

  return (
    <div className="surface-card mt-4 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="text-sm font-semibold">Vos livrables ({deliverables.length})</h2>
        <p className="text-xs text-muted-foreground">
          {toReview > 0
            ? `${toReview} à valider : ouvrez-le${toReview > 1 ? "s" : ""}, puis validez ou demandez des corrections.`
            : "Rien à valider pour le moment."}
        </p>
      </div>

      <ul className="mt-4 space-y-2">
        {list.map((d) => (
          <li
            key={d.id}
            id={`livrable-${d.id}`}
            className={cn(
              "flex scroll-mt-24 flex-col gap-3 rounded-lg border border-l-4 border-border p-4 transition-shadow duration-500 sm:flex-row sm:items-center",
              clientDeliverableBorderTone[deliverableState(d)],
              highlightedId === d.id && "ring-2 ring-primary ring-offset-2 ring-offset-background",
            )}
          >
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <p className="min-w-0 break-words text-sm font-semibold">{d.name}</p>
                <DeliverableStateBadge
                  deliverable={d}
                  audience="client"
                  showPublishedDate={false}
                />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{metaLine(d)}</p>
              <ScheduledLine deliverable={d} className="mt-1" />
              <DeliverableFeedback deliverable={d} audience="client" className="mt-2" />
            </div>
            <div className="flex flex-wrap items-center gap-2 sm:shrink-0 sm:justify-end">
              {hasDeliverableLink(d) && (
                <Button variant="outline" size="sm" asChild>
                  <a href={d.url} target="_blank" rel="noreferrer">
                    <ExternalLink className="mr-1 h-4 w-4" /> Ouvrir
                  </a>
                </Button>
              )}
              {awaits(d) && <DeliverableDecision deliverable={d} />}
            </div>
          </li>
        ))}
        {list.length === 0 && (
          <li className="py-6 text-center text-xs text-muted-foreground">
            Aucun livrable reçu pour le moment : ils apparaîtront ici dès que l'équipe vous les
            enverra.
          </li>
        )}
      </ul>
    </div>
  );
}
