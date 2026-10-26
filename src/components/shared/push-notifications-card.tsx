import { useEffect, useState } from "react";
import { Bell, BellOff, Share, SquarePlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/api";
import { disablePush, enablePush, getPushState, type PushState } from "@/lib/push";

/** Notifications push de l'appareil courant (téléphone, tablette, ordinateur). */
export function PushNotificationsCard() {
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getPushState()
      .then(setState)
      .catch(() => setState("unsupported"));
  }, []);

  const run = async (action: () => Promise<PushState>, success: string) => {
    setBusy(true);
    try {
      const next = await action();
      setState(next);
      if (next === "on" || next === "off") toast.success(success);
      if (next === "denied") toast.error("Notifications bloquées par le navigateur.");
    } catch (error) {
      toast.error(errorMessage(error, "Impossible de modifier les notifications."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="surface-card p-5">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <Bell className="h-4 w-4 text-primary" /> Notifications sur cet appareil
      </h2>

      {state === null && <p className="mt-2 text-xs text-muted-foreground">Vérification…</p>}

      {(state === "off" || state === "on") && (
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <p className="min-w-0 flex-1 text-xs text-muted-foreground">
            {state === "on"
              ? "Activées : vous êtes prévenu ici dès qu'une notification vous concerne, même OLYMPE fermé."
              : "Recevez vos notifications OLYMPE directement sur cet appareil, même quand OLYMPE est fermé."}
          </p>
          {state === "on" ? (
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => void run(disablePush, "Notifications désactivées sur cet appareil.")}
            >
              <BellOff className="mr-1 h-3.5 w-3.5" /> Désactiver
            </Button>
          ) : (
            <Button
              size="sm"
              disabled={busy}
              onClick={() => void run(enablePush, "Notifications activées sur cet appareil.")}
            >
              <Bell className="mr-1 h-3.5 w-3.5" /> Activer
            </Button>
          )}
        </div>
      )}

      {state === "ios-install" && (
        <div className="mt-2 space-y-2 text-xs text-muted-foreground">
          <p>Sur iPhone et iPad, ajoutez d'abord OLYMPE à votre écran d'accueil :</p>
          <ol className="list-decimal space-y-1.5 pl-5">
            <li>
              Touchez le bouton Partager{" "}
              <Share className="inline h-3.5 w-3.5 align-text-bottom text-foreground" /> en bas de
              Safari.
            </li>
            <li>
              Choisissez « Sur l'écran d'accueil »{" "}
              <SquarePlus className="inline h-3.5 w-3.5 align-text-bottom text-foreground" />, puis
              « Ajouter ».
            </li>
            <li>Ouvrez OLYMPE depuis la nouvelle icône, puis revenez sur cette page.</li>
          </ol>
        </div>
      )}

      {state === "denied" && (
        <p className="mt-2 text-xs text-muted-foreground">
          Les notifications sont bloquées pour OLYMPE dans ce navigateur. Pour les réactiver,
          autorisez-les dans les réglages du site (icône à gauche de l'adresse), puis rechargez la
          page.
        </p>
      )}

      {state === "unsupported" && (
        <p className="mt-2 text-xs text-muted-foreground">
          Ce navigateur ne permet pas de recevoir les notifications. Essayez avec Chrome, Edge,
          Firefox ou Safari à jour. Vous les retrouvez toujours dans la cloche.
        </p>
      )}

      {state === "server-disabled" && (
        <p className="mt-2 text-xs text-muted-foreground">
          Les notifications sur appareil ne sont pas encore disponibles. Vous les retrouvez dans la
          cloche.
        </p>
      )}
    </div>
  );
}
