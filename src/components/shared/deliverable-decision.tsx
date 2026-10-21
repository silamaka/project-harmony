import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, RefreshCcw } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { deliverableService } from "@/services";
import type { Deliverable } from "@/types";

/**
 * Décision du client sur un livrable que l'agence lui a envoyé : Valider,
 * ou Demander des corrections en expliquant quoi corriger. L'explication
 * est postée par le serveur dans la discussion de la mission, dans la même
 * transaction que le statut. Côté serveur, le client ne peut que valider ou
 * demander des corrections sur un livrable de son entreprise
 * (DeliverablePermission).
 */
export function DeliverableDecision({
  deliverable,
  size = "sm",
}: {
  deliverable: Deliverable;
  size?: "sm" | "default";
}) {
  const qc = useQueryClient();
  const [correctionsOpen, setCorrectionsOpen] = useState(false);
  const [details, setDetails] = useState("");

  // La mission suit la décision côté serveur (Validé / Corrections) : on
  // rafraîchit aussi les missions pour que le portail et la fiche suivent.
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["deliverables"] });
    void qc.invalidateQueries({ queryKey: ["comments"] });
    void qc.invalidateQueries({ queryKey: ["missions"] });
  };

  const validate = useMutation({
    mutationFn: () => deliverableService.updateStatus(deliverable.id, "valide"),
    onSuccess: () => {
      refresh();
      toast.success(`« ${deliverable.name} » validé. Merci !`);
    },
    onError: () => toast.error("Validation impossible."),
  });

  const requestCorrections = useMutation({
    mutationFn: () => deliverableService.requestCorrections(deliverable.id, details.trim()),
    onSuccess: () => {
      refresh();
      setCorrectionsOpen(false);
      setDetails("");
      toast.success("Demande de corrections envoyée à l'équipe.");
    },
    onError: () => toast.error("Envoi impossible."),
  });

  const pending = validate.isPending || requestCorrections.isPending;

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Button
          size={size}
          className="bg-success text-success-foreground hover:bg-success/90"
          disabled={pending || deliverable.status === "valide"}
          onClick={() => validate.mutate()}
        >
          <Check className="mr-1 h-4 w-4" /> Valider
        </Button>
        <Button
          size={size}
          variant="outline"
          className="border-warning text-warning hover:bg-warning/10"
          disabled={pending}
          onClick={() => setCorrectionsOpen(true)}
        >
          <RefreshCcw className="mr-1 h-4 w-4" /> Corrections
        </Button>
      </div>

      <Dialog open={correctionsOpen} onOpenChange={setCorrectionsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Demander des corrections</DialogTitle>
            <DialogDescription>
              Sur « {deliverable.name} ». Expliquez ce qu'il faut modifier : votre message sera
              transmis à l'équipe dans la discussion de la mission.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={details}
            maxLength={2000}
            rows={5}
            placeholder="Ex. : changer la couleur du titre, remplacer la photo de la 2e slide…"
            onChange={(e) => setDetails(e.target.value)}
          />
          <DialogFooter>
            <Button
              disabled={!details.trim() || requestCorrections.isPending}
              onClick={() => requestCorrections.mutate()}
            >
              {requestCorrections.isPending ? "Envoi..." : "Envoyer la demande"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
