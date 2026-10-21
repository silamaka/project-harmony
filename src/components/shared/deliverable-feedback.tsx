import { MessageSquareWarning } from "lucide-react";
import { deliverableState } from "@/components/shared/badges";
import { cn } from "@/lib/utils";
import type { Deliverable } from "@/types";

/**
 * Demande de corrections du client, affichée sur le livrable concerné : sur
 * une mission à plusieurs livrables, l'équipe voit d'un coup d'œil lequel
 * corriger et quoi, sans chercher dans la discussion. Le serveur l'efface
 * dès que le client valide ou qu'un nouveau lien arrive.
 */
export function DeliverableFeedback({
  deliverable,
  audience = "agence",
  className,
}: {
  deliverable: Deliverable;
  audience?: "agence" | "client";
  className?: string;
}) {
  if (!deliverable.client_feedback || deliverableState(deliverable) !== "corrections") return null;
  const date = deliverable.client_feedback_at
    ? ` le ${new Date(deliverable.client_feedback_at).toLocaleDateString("fr-FR")}`
    : "";
  return (
    <div
      className={cn(
        "flex gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-2.5 py-2 text-xs",
        className,
      )}
    >
      <MessageSquareWarning className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
      <div className="min-w-0">
        <p className="font-semibold text-destructive">
          {audience === "client" ? "Vos corrections" : "Corrections demandées par le client"}
          {date}
        </p>
        <p className="mt-0.5 whitespace-pre-wrap break-words text-foreground">
          {deliverable.client_feedback}
        </p>
      </div>
    </div>
  );
}
