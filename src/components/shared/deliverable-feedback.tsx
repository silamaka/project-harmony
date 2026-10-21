import { ExternalLink, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { deliverableState } from "@/components/shared/badges";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CORRECTION_CATEGORY_LABELS, type Deliverable } from "@/types";

/**
 * Demande de corrections du client, affichée sur le livrable concerné, à
 * lire en trois secondes : "À corriger" et la date, ce qui est à corriger
 * (pastilles), le détail, l'exemple éventuel. `onFix` (si la personne peut
 * modifier le lien) ajoute l'action qui y répond : déposer la version
 * corrigée. Le serveur efface la demande dès que le client valide ou qu'un
 * nouveau lien arrive ; le message reste aussi dans la discussion.
 */
export function DeliverableFeedback({
  deliverable,
  audience = "agence",
  className,
  onFix,
}: {
  deliverable: Deliverable;
  audience?: "agence" | "client";
  className?: string;
  onFix?: (() => void) | undefined;
}) {
  if (
    deliverable.client_status !== "corrections" ||
    deliverableState(deliverable) !== "corrections"
  )
    return null;
  const date = deliverable.client_feedback_at
    ? new Date(deliverable.client_feedback_at).toLocaleDateString("fr-FR")
    : null;
  const categories = deliverable.client_feedback_categories ?? [];
  return (
    <FeedbackBox
      deliverable={deliverable}
      audience={audience}
      className={className}
      onFix={onFix}
      date={date}
      categories={categories}
    />
  );
}

function FeedbackBox({
  deliverable,
  audience,
  className,
  onFix,
  date,
  categories,
}: {
  deliverable: Deliverable;
  audience: "agence" | "client";
  className?: string | undefined;
  onFix?: (() => void) | undefined;
  date: string | null;
  categories: Deliverable["client_feedback_categories"];
}) {
  // Repliée sur 2 lignes : assez pour comprendre la demande sans encombrer
  // la liste. "Voir plus" n'apparaît que si le texte dépasse vraiment.
  const textRef = useRef<HTMLParagraphElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const text = deliverable.client_feedback;
  useEffect(() => {
    const el = textRef.current;
    if (!el || expanded) return;
    const check = () => setOverflows(el.scrollHeight > el.clientHeight + 1);
    check();
    const observer = new ResizeObserver(check);
    observer.observe(el);
    return () => observer.disconnect();
  }, [text, expanded]);

  return (
    <div
      className={cn(
        "rounded-lg border border-destructive/25 bg-destructive/5 p-3 text-sm",
        className,
      )}
    >
      <p className="text-xs">
        <span className="font-semibold text-destructive">
          {audience === "client" ? "Vos corrections" : "À corriger"}
        </span>
        {date && (
          <span className="text-muted-foreground">
            {" "}
            ·{" "}
            {deliverable.client_decided_by_name
              ? audience === "client"
                ? "enregistrées par l'agence"
                : `enregistré par ${deliverable.client_decided_by_name} pour le client`
              : audience === "client"
                ? "envoyées"
                : "demandé par le client"}{" "}
            le {date}
          </span>
        )}
      </p>
      {categories.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {categories.map((c) => (
            <li
              key={c}
              className="rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-medium text-destructive"
            >
              {CORRECTION_CATEGORY_LABELS[c]}
            </li>
          ))}
        </ul>
      )}
      {(text || categories.length === 0) && (
        <p
          ref={textRef}
          className={cn(
            "mt-2 whitespace-pre-wrap text-foreground [overflow-wrap:anywhere]",
            !expanded && "line-clamp-2",
          )}
        >
          {/* Détail facultatif. Sans détail ni catégorie : soit le client
              n'a rien précisé, soit c'est une demande antérieure à
              l'enregistrement du texte (restée dans la discussion). */}
          {text ||
            (deliverable.client_feedback_at
              ? audience === "client"
                ? "Aucune précision donnée."
                : "Le client n'a pas précisé quoi corriger."
              : "Le détail est dans la discussion de la mission.")}
        </p>
      )}
      {(overflows || expanded) && (
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
          className="mt-1 text-xs font-medium text-primary hover:underline"
        >
          {expanded ? "Voir moins" : "Voir plus"}
        </button>
      )}
      {deliverable.client_feedback_link && (
        <a
          href={deliverable.client_feedback_link}
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
        >
          <ExternalLink className="h-3.5 w-3.5" /> Voir l'exemple joint
        </a>
      )}
      {onFix && (
        <Button size="sm" className="mt-3 w-full" onClick={onFix}>
          <Upload className="mr-1 h-4 w-4" /> Déposer la v{deliverable.version + 1}
        </Button>
      )}
    </div>
  );
}
