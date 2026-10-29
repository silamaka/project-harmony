import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, RefreshCcw, UserCheck, UserPen } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/context/auth-context";
import { actionChip, actionLabel } from "@/components/shared/action-chip";
import { WEB_URL_HINT, cn, isWebUrl } from "@/lib/utils";
import { deliverableService } from "@/services";
import { CORRECTION_CATEGORY_LABELS, type CorrectionCategory, type Deliverable } from "@/types";
import { errorMessage } from "@/lib/api";

const CATEGORIES = Object.keys(CORRECTION_CATEGORY_LABELS) as CorrectionCategory[];

/**
 * Décision du client (Deliverable.client_status) sur un livrable que
 * l'agence a validé, donc envoyé : Valider, ou Demander des corrections.
 * La demande est guidée pour être exploitable par l'équipe : ce qui est à
 * corriger (catégories), où et quoi changer (texte libre) et un lien
 * d'exemple, le tout facultatif. `onBehalf` : l'admin / le chef de projet
 * enregistre la réponse d'un client reçue hors du portail (téléphone,
 * e-mail...) ; le serveur trace qui l'a enregistrée, et l'agence peut
 * annuler une décision qu'elle a enregistrée (jamais celle du client
 * lui-même), tant que rien n'est publié. `variant="icons"` :
 * deux icônes alignées sur les autres actions du livrable (vues agence). Mêmes règles côté serveur, qui poste aussi
 * la demande dans la discussion de la mission, dans la même transaction.
 */
export function DeliverableDecision({
  deliverable,
  size = "sm",
  onBehalf = false,
  variant = "buttons",
}: {
  deliverable: Deliverable;
  size?: "sm" | "default";
  onBehalf?: boolean;
  variant?: "buttons" | "icons";
}) {
  const qc = useQueryClient();
  const [correctionsOpen, setCorrectionsOpen] = useState(false);
  const [categories, setCategories] = useState<CorrectionCategory[]>([]);
  const [details, setDetails] = useState("");
  const [referenceUrl, setReferenceUrl] = useState("");
  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false);
  const { hasRole } = useAuth();
  const isAdmin = hasRole("admin");

  // La mission suit la décision côté serveur (Validé / Corrections) : on
  // rafraîchit aussi les missions pour que le portail et la fiche suivent.
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["deliverables"] });
    void qc.invalidateQueries({ queryKey: ["comments"] });
    void qc.invalidateQueries({ queryKey: ["missions"] });
  };

  const validate = useMutation({
    mutationFn: () => deliverableService.clientValidate(deliverable.id),
    onSuccess: () => {
      refresh();
      toast.success(
        onBehalf
          ? `« ${deliverable.name} » validé pour le client.`
          : `« ${deliverable.name} » validé. Merci !`,
      );
    },
    onError: (error) => toast.error(errorMessage(error, "Validation impossible.")),
  });

  const requestCorrections = useMutation({
    mutationFn: () =>
      deliverableService.requestCorrections(deliverable.id, {
        comment: details.trim(),
        categories,
        reference_url: referenceUrl.trim(),
      }),
    onSuccess: () => {
      refresh();
      setCorrectionsOpen(false);
      setCategories([]);
      setDetails("");
      setReferenceUrl("");
      toast.success(
        onBehalf
          ? "Corrections enregistrées pour le client."
          : "Demande de corrections envoyée à l'équipe.",
      );
    },
    onError: (error) => toast.error(errorMessage(error, "Envoi impossible.")),
  });

  const cancelDecision = useMutation({
    mutationFn: () => deliverableService.cancelClientDecision(deliverable.id),
    onSuccess: () => {
      refresh();
      setConfirmCancelOpen(false);
      setCorrectionsOpen(false);
      toast.success("Décision annulée : le livrable attend de nouveau la réponse du client.");
    },
    onError: (error) => toast.error(errorMessage(error, "Annulation impossible.")),
  });

  const toggleCategory = (c: CorrectionCategory) =>
    setCategories((current) =>
      current.includes(c) ? current.filter((x) => x !== c) : [...current, c],
    );
  const referenceInvalid = referenceUrl.trim() !== "" && !isWebUrl(referenceUrl);
  const canSend = !referenceInvalid && !requestCorrections.isPending;

  const pending = validate.isPending || requestCorrections.isPending || cancelDecision.isPending;

  const validated = deliverable.client_status === "valide";
  const inCorrections = deliverable.client_status === "corrections";
  /** Décision enregistrée par l'agence (pas par le client lui-même) et pas
   * encore publiée : l'agence peut l'annuler (même règle côté serveur). */
  // Même règle côté serveur : décision enregistrée par l'agence ou ancienne
  // décision sans trace ; celle prise par le client lui-même (datée, sans
  // agence) : l'administrateur seul, et le client en est prévenu.
  const clientsOwnDecision =
    !deliverable.client_decided_by_name &&
    (!!deliverable.client_validated_at || !!deliverable.client_feedback_at);
  const canCancel = onBehalf && !deliverable.published_at && (!clientsOwnDecision || isAdmin);

  return (
    <>
      {variant === "icons" ? (
        <>
          <button
            type="button"
            onClick={() => (validated ? setConfirmCancelOpen(true) : validate.mutate())}
            disabled={pending || (validated && !canCancel)}
            aria-label={
              validated && canCancel
                ? `Annuler la validation de ${deliverable.name} enregistrée pour le client`
                : `Valider ${deliverable.name} pour le client`
            }
            title={
              !validated
                ? "Valider pour le client"
                : clientsOwnDecision
                  ? canCancel
                    ? "Validé par le client lui-même — cliquer pour annuler (il sera prévenu)"
                    : "Validé par le client lui-même (seul l'administrateur peut annuler)"
                  : canCancel
                    ? "Validé pour le client — cliquer pour annuler"
                    : "Validé pour le client"
            }
            className={cn(
              actionChip,
              "hover:text-success disabled:cursor-default disabled:hover:text-muted-foreground",
              validated && "text-success disabled:hover:text-success",
              validated && canCancel && "hover:text-destructive",
            )}
          >
            <UserCheck className="h-4 w-4 shrink-0" />
            <span className={actionLabel}>
              {!validated
                ? "Valider (client)"
                : canCancel
                  ? "Annuler validation"
                  : "Validé (client)"}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setCorrectionsOpen(true)}
            disabled={pending}
            aria-label={`Corrections pour le client sur ${deliverable.name}`}
            title={
              inCorrections
                ? "Corrections pour le client (mettre à jour la demande)"
                : "Corrections pour le client"
            }
            className={cn(actionChip, "hover:text-warning", inCorrections && "text-destructive")}
          >
            <UserPen className="h-4 w-4 shrink-0" />
            <span className={actionLabel}>Corriger (client)</span>
          </button>
        </>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button
            size={size}
            className="bg-success text-success-foreground hover:bg-success/90"
            disabled={pending || deliverable.client_status === "valide"}
            onClick={() => validate.mutate()}
          >
            <Check className="mr-1 h-4 w-4" /> {onBehalf ? "Valider pour le client" : "Valider"}
          </Button>
          <Button
            size={size}
            variant="outline"
            className="border-warning text-warning hover:bg-warning/10"
            disabled={pending}
            onClick={() => setCorrectionsOpen(true)}
          >
            <RefreshCcw className="mr-1 h-4 w-4" />{" "}
            {onBehalf ? "Corrections pour le client" : "Corrections"}
          </Button>
        </div>
      )}

      <Dialog open={correctionsOpen} onOpenChange={setCorrectionsOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {onBehalf ? "Corrections demandées par le client" : "Demander des corrections"}
            </DialogTitle>
            <DialogDescription>
              « {deliverable.name} » v{deliverable.version}.{" "}
              {onBehalf
                ? "Note ce que le client a demandé (téléphone, e-mail…) : ce sera enregistré à ton nom, pour lui."
                : "Plus votre demande est précise, plus la version corrigée sera juste du premier coup."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <fieldset>
              <legend className="text-sm font-medium">
                Que faut-il corriger ? <span className="text-muted-foreground">(facultatif)</span>
              </legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {CATEGORIES.map((c) => {
                  const selected = categories.includes(c);
                  return (
                    <button
                      key={c}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => toggleCategory(c)}
                      className={cn(
                        "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                        selected
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border text-muted-foreground hover:border-primary/50",
                      )}
                    >
                      {selected && <Check className="mr-1 inline h-3 w-3" />}
                      {CORRECTION_CATEGORY_LABELS[c]}
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <div>
              <label htmlFor={`corrections-${deliverable.id}`} className="text-sm font-medium">
                Précisez où et quoi changer{" "}
                <span className="text-muted-foreground">(facultatif)</span>
              </label>
              <Textarea
                id={`corrections-${deliverable.id}`}
                value={details}
                maxLength={2000}
                rows={5}
                className="mt-2"
                placeholder={
                  "Un élément par ligne, par exemple :\n" +
                  "- Titre : remplacer « Été » par « Summer »\n" +
                  "- Logo trop petit en bas à droite"
                }
                onChange={(e) => setDetails(e.target.value)}
              />
            </div>

            <div>
              <label htmlFor={`reference-${deliverable.id}`} className="text-sm font-medium">
                Lien d'exemple ou de capture{" "}
                <span className="text-muted-foreground">(facultatif)</span>
              </label>
              <Input
                id={`reference-${deliverable.id}`}
                value={referenceUrl}
                placeholder="https://…"
                aria-invalid={referenceInvalid}
                className={cn("mt-2", referenceInvalid && "border-destructive")}
                onChange={(e) => setReferenceUrl(e.target.value)}
              />
              {referenceInvalid && <p className="mt-1 text-xs text-destructive">{WEB_URL_HINT}</p>}
            </div>
          </div>

          <DialogFooter className="gap-2 sm:justify-between">
            {inCorrections && canCancel ? (
              <Button
                variant="outline"
                className="border-destructive/40 text-destructive hover:bg-destructive/10"
                disabled={cancelDecision.isPending}
                onClick={() => {
                  setCorrectionsOpen(false);
                  setConfirmCancelOpen(true);
                }}
              >
                {clientsOwnDecision ? "Annuler la demande du client" : "Annuler cette demande"}
              </Button>
            ) : (
              <span />
            )}
            <Button disabled={!canSend} onClick={() => requestCorrections.mutate()}>
              {requestCorrections.isPending
                ? "Envoi..."
                : onBehalf
                  ? "Enregistrer"
                  : "Envoyer la demande"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Annuler une décision (validation ou demande de corrections). */}
      <Dialog open={confirmCancelOpen} onOpenChange={setConfirmCancelOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {validated ? "Annuler la validation ?" : "Annuler la demande de corrections ?"}
            </DialogTitle>
            <DialogDescription>
              « {deliverable.name} » v{deliverable.version}{" "}
              {clientsOwnDecision
                ? validated
                  ? `a été validé par le client lui-même${deliverable.client_decision_author_name ? ` (${deliverable.client_decision_author_name})` : ""}.`
                  : `fait l'objet d'une demande de corrections du client lui-même${deliverable.client_decision_author_name ? ` (${deliverable.client_decision_author_name})` : ""}.`
                : deliverable.client_decided_by_name
                  ? `${validated ? "a été validé" : "a une demande de corrections enregistrée"} pour le client par ${deliverable.client_decided_by_name}.`
                  : validated
                    ? "a été validé par le client."
                    : "fait l'objet d'une demande de corrections du client."}{" "}
              Il repassera « Chez le client », en attente de sa réponse.
            </DialogDescription>
          </DialogHeader>
          {clientsOwnDecision && (
            <p className="rounded-md bg-warning/10 px-3 py-2 text-xs text-warning">
              C'est la décision du client lui-même : il sera prévenu de l'annulation (notification
              et message dans la discussion).
            </p>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConfirmCancelOpen(false)}>
              {validated ? "Garder la validation" : "Garder la demande"}
            </Button>
            <Button
              variant="destructive"
              disabled={cancelDecision.isPending}
              onClick={() => cancelDecision.mutate()}
            >
              {cancelDecision.isPending
                ? "Annulation..."
                : validated
                  ? "Annuler la validation"
                  : "Annuler la demande"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
