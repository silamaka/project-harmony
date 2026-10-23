import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CalendarClock } from "lucide-react";
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
import { actionChip, actionLabel } from "@/components/shared/action-chip";
import { errorMessage } from "@/lib/api";
import { cn } from "@/lib/utils";
import { deliverableService } from "@/services";
import type { Deliverable } from "@/types";

/**
 * Date de publication prévue d'un livrable : programmée par l'équipe,
 * visible du client (échéance pour valider), au calendrier et dans les
 * alertes. Rien n'est publié automatiquement : à la date, l'équipe publie
 * hors de la plateforme puis l'enregistre (📣).
 */

const SOON_MS = 48 * 60 * 60 * 1000;

const formatWhen = (iso: string) => {
  const d = new Date(iso);
  return `${d.toLocaleDateString("fr-FR")} à ${d.toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
};

/** Texte et urgence de la date prévue (rien une fois publié ou sans date). */
export function scheduleInfo(d: Pick<Deliverable, "scheduled_at" | "published_at">) {
  if (!d.scheduled_at || d.published_at) return null;
  const delta = new Date(d.scheduled_at).getTime() - Date.now();
  const tone: "late" | "soon" | "later" = delta < 0 ? "late" : delta < SOON_MS ? "soon" : "later";
  const text =
    tone === "late"
      ? `Publication prévue le ${formatWhen(d.scheduled_at)} — date dépassée`
      : `Publication prévue le ${formatWhen(d.scheduled_at)}`;
  return { text, tone };
}

const toneClass = {
  late: "text-destructive",
  soon: "text-warning",
  later: "text-muted-foreground",
} as const;

/** Ligne "Publication prévue le …", colorée à l'approche de la date. */
export function ScheduledLine({
  deliverable,
  className,
}: {
  deliverable: Pick<Deliverable, "scheduled_at" | "published_at">;
  className?: string;
}) {
  const info = scheduleInfo(deliverable);
  if (!info) return null;
  return (
    <p
      className={cn(
        "flex items-center gap-1 text-[11px] font-medium",
        toneClass[info.tone],
        className,
      )}
    >
      <CalendarClock className="h-3.5 w-3.5 shrink-0" />
      {info.text}
    </p>
  );
}

/** "AAAA-MM-JJTHH:mm" en heure locale, pour un champ datetime-local. */
function toLocalInput(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

function defaultInput(d: Deliverable) {
  if (d.scheduled_at) return toLocalInput(new Date(d.scheduled_at));
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(10, 0, 0, 0);
  return toLocalInput(tomorrow);
}

/** Icône 📅 et fenêtre "Programmer la publication" (équipe uniquement). */
export function ScheduleButton({ deliverable: d }: { deliverable: Deliverable }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(() => defaultInput(d));

  const save = useMutation({
    mutationFn: (iso: string | null) => deliverableService.schedule(d.id, iso),
    onSuccess: (_r, iso) => {
      void qc.invalidateQueries({ queryKey: ["deliverables"] });
      void qc.invalidateQueries({ queryKey: ["calendar"] });
      void qc.invalidateQueries({ queryKey: ["comments"] });
      void qc.invalidateQueries({ queryKey: ["dashboard", "alerts"] });
      setOpen(false);
      toast.success(iso ? "Publication programmée." : "Date de publication retirée.");
    },
    onError: (error) => toast.error(errorMessage(error, "Programmation impossible.")),
  });

  const parsed = value ? new Date(value) : null;
  const inPast = !!parsed && parsed.getTime() < Date.now();
  const scheduled = !!d.scheduled_at;

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setValue(defaultInput(d));
          setOpen(true);
        }}
        aria-label={
          scheduled
            ? `Modifier la date de publication de ${d.name}`
            : `Programmer la publication de ${d.name}`
        }
        title={
          scheduled
            ? `Publication prévue le ${formatWhen(d.scheduled_at as string)} — modifier`
            : "Programmer la publication"
        }
        className={cn(actionChip, "hover:text-primary", scheduled && "text-primary")}
      >
        <CalendarClock className="h-4 w-4 shrink-0" />
        <span className={actionLabel}>{scheduled ? "Date prévue" : "Programmer"}</span>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Programmer la publication</DialogTitle>
            <DialogDescription>
              « {d.name} » v{d.version}. La date apparaît au calendrier, et le client la voit une
              fois le livrable envoyé. La publication elle-même se fait hors de la plateforme, puis
              s'enregistre avec 📣.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <label htmlFor={`schedule-${d.id}`} className="text-sm font-medium">
              Date et heure de publication
            </label>
            <Input
              id={`schedule-${d.id}`}
              type="datetime-local"
              value={value}
              aria-invalid={inPast}
              className={cn(inPast && "border-destructive")}
              onChange={(e) => setValue(e.target.value)}
            />
            {inPast && (
              <p className="text-xs text-destructive">Choisissez une date et une heure à venir.</p>
            )}
          </div>
          <DialogFooter className="gap-2 sm:justify-between">
            {scheduled ? (
              <Button
                variant="outline"
                className="border-destructive/40 text-destructive hover:bg-destructive/10"
                disabled={save.isPending}
                onClick={() => save.mutate(null)}
              >
                Retirer la date
              </Button>
            ) : (
              <span />
            )}
            <Button
              disabled={!parsed || inPast || save.isPending}
              onClick={() => parsed && save.mutate(parsed.toISOString())}
            >
              {save.isPending ? "Enregistrement..." : "Programmer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
