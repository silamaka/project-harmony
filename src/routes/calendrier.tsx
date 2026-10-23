import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
  addDays,
  addMonths,
  addWeeks,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isToday,
  parseISO,
  startOfMonth,
  startOfWeek,
  subMonths,
  subWeeks,
} from "date-fns";
import { fr } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Plus, Search } from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CalendarEventPreview } from "@/components/shared/calendar-event-preview";
import { ConfirmDeleteButton } from "@/components/shared/edit-dialogs";
import { cn } from "@/lib/utils";
import { calendarService, isLate, missionService } from "@/services";
import { TASK_TYPE_LABELS, type CalendarEvent as ApiCalendarEvent } from "@/types";
import { errorMessage } from "@/lib/api";

/** Événement tel qu'affiché : `late` marque une échéance de mission dépassée
 * et pas finie ; `overdueSince` marque sa copie reportée sur aujourd'hui
 * (date d'échéance d'origine). Champs purement d'affichage. */
type CalendarEvent = ApiCalendarEvent & { late?: boolean; overdueSince?: string };

export const Route = createFileRoute("/calendrier")({
  head: () => ({
    meta: [
      { title: "Calendrier — OLYMPE" },
      {
        name: "description",
        content:
          "Vue jour, semaine, mois et agenda des échéances de missions, livrables et réunions.",
      },
      { property: "og:title", content: "Calendrier — OLYMPE" },
      { property: "og:description", content: "Planning complet de l'agence, façon Google Agenda." },
    ],
  }),
  component: CalendarPage,
});

type ViewMode = "jour" | "semaine" | "mois" | "agenda";
type EventType = CalendarEvent["type"];

const VIEWS: { key: ViewMode; label: string }[] = [
  { key: "jour", label: "Jour" },
  { key: "semaine", label: "Semaine" },
  { key: "mois", label: "Mois" },
  { key: "agenda", label: "Agenda" },
];

const TYPE_TONE: Record<EventType, string> = {
  mission: "bg-primary/10 text-primary border-primary/20",
  publication: "bg-success/15 text-success border-success/30",
  livrable: "bg-info/15 text-info border-info/20",
  reunion: "bg-warning/20 text-warning border-warning/30",
};

const TYPE_DOT: Record<EventType, string> = {
  mission: "bg-primary",
  // Prévue : pastille claire ; publiée : pleine (voir dotOf).
  publication: "bg-success/40 ring-1 ring-success",
  livrable: "bg-info",
  reunion: "bg-warning",
};

const TYPE_LABEL: Record<EventType, string> = {
  ...TASK_TYPE_LABELS,
  publication: "Publication",
};

const LATE_TONE = "bg-destructive/12 text-destructive border-destructive/30";

const formatShort = (iso: string) => format(parseISO(iso), "dd/MM", { locale: fr });

/** Même règle que le dashboard : une mission échue et pas finie (ni
 * Terminée, ni Validée, ni Publiée) reste à traiter. Elle garde sa date
 * d'origine (marquée en retard) et une copie est reportée sur aujourd'hui,
 * jusqu'à ce qu'elle soit finie — comme Google Tasks / Todoist. */
function withOverdueRollover(events: ApiCalendarEvent[]): CalendarEvent[] {
  const today = format(new Date(), "yyyy-MM-dd");
  const result: CalendarEvent[] = [];
  for (const raw of events) {
    // Publication prévue : date et heure dans le fuseau du navigateur (le
    // serveur les calcule dans le sien).
    const e = raw.scheduled_at
      ? {
          ...raw,
          date: format(parseISO(raw.scheduled_at), "yyyy-MM-dd"),
          time: format(parseISO(raw.scheduled_at), "HH:mm"),
        }
      : raw;
    const late = isMissionEvent(e) && !!e.status && isLate({ deadline: e.date, status: e.status });
    result.push(late ? { ...e, late } : e);
    if (late) {
      // Id toujours préfixé "ev-" : la copie reste une échéance de mission,
      // donc glissable (la déposer sur un autre jour replanifie l'échéance).
      result.push({ ...e, id: `${e.id}:retard`, date: today, late, overdueSince: e.date });
    }
  }
  return result;
}

/** Les retards en tête de journée, puis l'ordre horaire. */
const byDayOrder = (a: CalendarEvent, b: CalendarEvent) =>
  Number(!!b.overdueSince) - Number(!!a.overdueSince) || (a.time ?? "").localeCompare(b.time ?? "");

/** Publication effectuée : vert plein, pour la distinguer d'une publication
 * seulement prévue (vert clair). */
const PUBLISHED_TONE = "bg-success text-success-foreground border-success";

const toneOf = (e: CalendarEvent) =>
  e.late ? LATE_TONE : e.published_at ? PUBLISHED_TONE : TYPE_TONE[e.type];

const dotOf = (e: CalendarEvent) =>
  e.late ? "bg-destructive" : e.published_at ? "bg-success" : TYPE_DOT[e.type];

const labelOf = (e: CalendarEvent) => (e.published_at ? "Publiée" : TYPE_LABEL[e.type]);

/** Échéance de mission (générée côté serveur, id "ev-<uuid>") : à distinguer
 * d'un livrable réellement déposé ou d'une réunion réellement créée, qui
 * partagent parfois le même `type` (une mission peut être taguée "Réunion"
 * sans être une vraie réunion du modèle Meeting). */
const isMissionEvent = (e: ApiCalendarEvent) => e.id.startsWith("ev-");
/** Vraie réunion (modèle Meeting) : jamais de mission_id, contrairement à
 * une mission taguée "Réunion" ou à un livrable déposé sur une mission. */
const isRealMeeting = (e: CalendarEvent) => e.type === "reunion" && !e.mission_id;

function CalendarPage() {
  const qc = useQueryClient();
  const { data: rawEvents } = useQuery({ queryKey: ["calendar"], queryFn: calendarService.list });
  const events = useMemo(() => withOverdueRollover(rawEvents ?? []), [rawEvents]);
  const [view, setView] = useState<ViewMode>("mois");
  // Sur téléphone, 7 colonnes réduisent les événements à "e…" : la vue
  // Agenda (liste) s'ouvre par défaut. Après montage seulement, pour ne pas
  // diverger du rendu serveur ; la vue Mois reste disponible.
  useEffect(() => {
    if (window.matchMedia("(max-width: 639px)").matches) setView("agenda");
  }, []);
  const [cursor, setCursor] = useState(() => new Date());
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<"tous" | EventType>("tous");
  const [selected, setSelected] = useState<CalendarEvent | null>(null);
  const [dayView, setDayView] = useState<Date | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [formEvent, setFormEvent] = useState<CalendarEvent | null>(null);
  const [formDate, setFormDate] = useState<string | null>(null);

  const updateMeeting = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<CalendarEvent> }) =>
      calendarService.updateMeeting(id, patch),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["calendar"] }),
    onError: (error) => toast.error(errorMessage(error, "Déplacement impossible.")),
  });

  const removeMeeting = useMutation({
    mutationFn: (id: string) => calendarService.removeMeeting(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["calendar"] });
      toast.success("Réunion supprimée.");
      setSelected(null);
    },
    onError: (error) => toast.error(errorMessage(error, "Suppression impossible.")),
  });

  const updateMissionDeadline = useMutation({
    mutationFn: ({ id, deadline }: { id: string; deadline: string }) =>
      missionService.update(id, { deadline }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["calendar"] });
      void qc.invalidateQueries({ queryKey: ["missions"] });
    },
    onError: (error) => toast.error(errorMessage(error, "Déplacement impossible.")),
  });

  /** Le backend ne renvoie déjà que les événements de mission/livrable visibles pour le rôle courant. */
  const visibleEvents = useMemo(
    () =>
      events.filter(
        (e) =>
          (typeFilter === "tous" || e.type === typeFilter) &&
          e.title.toLowerCase().includes(query.toLowerCase()),
      ),
    [events, typeFilter, query],
  );

  const eventsOn = (date: Date) =>
    visibleEvents.filter((e) => isSameDay(parseISO(e.date), date)).sort(byDayOrder);
  /** Volontairement non filtré : cliquer sur une date doit montrer tout ce qui s'y passe, même si des filtres masquent certains types sur la grille. */
  const allEventsOn = (date: Date) =>
    events.filter((e) => isSameDay(parseISO(e.date), date)).sort(byDayOrder);

  const handleDrop = (date: Date, eventId: string) => {
    const ev = visibleEvents.find((e) => e.id === eventId);
    if (!ev) return;
    const iso = format(date, "yyyy-MM-dd");
    if (isMissionEvent(ev) && ev.mission_id) {
      updateMissionDeadline.mutate({ id: ev.mission_id, deadline: iso });
    } else if (isRealMeeting(ev)) {
      updateMeeting.mutate({ id: ev.id, patch: { date: iso } });
    }
  };

  const openCreate = (date: Date) => {
    setFormEvent(null);
    setFormDate(format(date, "yyyy-MM-dd"));
    setFormOpen(true);
  };

  const openEdit = (event: CalendarEvent) => {
    setSelected(null);
    setFormEvent(event);
    setFormDate(null);
    setFormOpen(true);
  };

  const goToday = () => setCursor(new Date());
  const goPrev = () => {
    if (view === "mois") setCursor((c) => subMonths(c, 1));
    else if (view === "semaine") setCursor((c) => subWeeks(c, 1));
    else if (view === "jour") setCursor((c) => addDays(c, -1));
  };
  const goNext = () => {
    if (view === "mois") setCursor((c) => addMonths(c, 1));
    else if (view === "semaine") setCursor((c) => addWeeks(c, 1));
    else if (view === "jour") setCursor((c) => addDays(c, 1));
  };

  const periodLabel =
    view === "mois"
      ? format(cursor, "MMMM yyyy", { locale: fr })
      : view === "semaine"
        ? `${format(startOfWeek(cursor, { weekStartsOn: 1 }), "d MMM", { locale: fr })} – ${format(endOfWeek(cursor, { weekStartsOn: 1 }), "d MMM yyyy", { locale: fr })}`
        : view === "jour"
          ? format(cursor, "EEEE d MMMM yyyy", { locale: fr })
          : "Tous les événements";

  return (
    <AppShell
      title="Calendrier"
      subtitle={periodLabel}
      actions={
        <div className="flex flex-wrap items-center justify-end gap-2">
          {view !== "agenda" && (
            <div className="flex items-center gap-1">
              <Button variant="outline" size="sm" onClick={goToday}>
                Aujourd'hui
              </Button>
              <Button variant="outline" size="icon" aria-label="Précédent" onClick={goPrev}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon" aria-label="Suivant" onClick={goNext}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
          <Button
            size="sm"
            onClick={() => {
              setFormEvent(null);
              setFormDate(format(cursor, "yyyy-MM-dd"));
              setFormOpen(true);
            }}
          >
            <Plus className="mr-1 h-4 w-4" /> Nouvel événement
          </Button>
        </div>
      }
    >
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1 rounded-lg border border-border p-1">
          {VIEWS.map((v) => (
            <button
              key={v.key}
              onClick={() => setView(v.key)}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                view === v.key
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent",
              )}
            >
              {v.label}
            </button>
          ))}
        </div>

        <div className="relative min-w-56 flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Rechercher un événement..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setTypeFilter("tous")}
            className={cn(
              "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
              typeFilter === "tous"
                ? "border-foreground/30 bg-foreground/10 text-foreground"
                : "border-border text-muted-foreground opacity-50 hover:opacity-80",
            )}
          >
            Tous
          </button>
          {(Object.keys(TYPE_LABEL) as EventType[]).map((t) => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                typeFilter === t
                  ? TYPE_TONE[t]
                  : "border-border text-muted-foreground opacity-50 hover:opacity-80",
              )}
            >
              <span className={cn("h-2 w-2 rounded-full", TYPE_DOT[t])} />
              {TYPE_LABEL[t]}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4">
        {view === "mois" && (
          <MonthView
            cursor={cursor}
            eventsOn={eventsOn}
            onDayClick={setDayView}
            onEventClick={setSelected}
            onDrop={handleDrop}
          />
        )}
        {view === "semaine" && (
          <WeekView
            cursor={cursor}
            eventsOn={eventsOn}
            onDayClick={setDayView}
            onEventClick={setSelected}
            onDrop={handleDrop}
          />
        )}
        {view === "jour" && (
          <DayView cursor={cursor} eventsOn={eventsOn} onEventClick={setSelected} />
        )}
        {view === "agenda" && <AgendaView events={visibleEvents} onEventClick={setSelected} />}
      </div>

      <EventDetailDialog
        event={selected}
        onClose={() => setSelected(null)}
        onEdit={openEdit}
        onDelete={(id) => removeMeeting.mutate(id)}
        deletePending={removeMeeting.isPending}
      />

      <DayEventsDialog
        date={dayView}
        events={dayView ? allEventsOn(dayView) : []}
        hiddenByFilters={dayView ? allEventsOn(dayView).length - eventsOn(dayView).length : 0}
        onClose={() => setDayView(null)}
        onEventClick={(e) => {
          setDayView(null);
          setSelected(e);
        }}
        onAdd={(date) => {
          setDayView(null);
          openCreate(date);
        }}
      />

      <MeetingFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        event={formEvent}
        defaultDate={formDate}
      />
    </AppShell>
  );
}

/* --------------------------------- Mois ---------------------------------- */
function MonthView({
  cursor,
  eventsOn,
  onDayClick,
  onEventClick,
  onDrop,
}: {
  cursor: Date;
  eventsOn: (date: Date) => CalendarEvent[];
  onDayClick: (date: Date) => void;
  onEventClick: (event: CalendarEvent) => void;
  onDrop: (date: Date, eventId: string) => void;
}) {
  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(cursor), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(cursor), { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end });
  }, [cursor]);
  const monthIndex = cursor.getMonth();

  return (
    <div className="surface-card overflow-hidden p-2 sm:p-4">
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {days.slice(0, 7).map((d) => (
          <div key={d.toISOString()} className="py-2">
            {format(d, "EEE", { locale: fr })}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {days.map((date) => {
          const list = eventsOn(date);
          const inMonth = date.getMonth() === monthIndex;
          return (
            <button
              key={date.toISOString()}
              type="button"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                onDrop(date, e.dataTransfer.getData("text/plain"));
              }}
              onClick={() => onDayClick(date)}
              aria-label={`Voir les événements du ${format(date, "d MMMM yyyy", { locale: fr })}`}
              className={cn(
                "flex min-h-24 w-full min-w-0 flex-col justify-start overflow-hidden cursor-pointer rounded-lg border border-border/60 p-1.5 text-left transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                !inMonth && "bg-muted/30 opacity-50",
                isToday(date) && "border-primary bg-primary/5",
              )}
            >
              <span
                className={cn(
                  "text-xs font-semibold text-muted-foreground",
                  isToday(date) && "text-primary",
                )}
              >
                {date.getDate()}
              </span>
              <div className="mt-1 w-full min-w-0 space-y-1">
                {list.slice(0, 3).map((e) => (
                  <EventChip key={e.id} event={e} onClick={onEventClick} />
                ))}
                {list.length > 3 && (
                  <p className="px-1 text-[10px] text-muted-foreground">
                    +{list.length - 3} autre(s)
                  </p>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* -------------------------------- Semaine --------------------------------- */
function WeekView({
  cursor,
  eventsOn,
  onDayClick,
  onEventClick,
  onDrop,
}: {
  cursor: Date;
  eventsOn: (date: Date) => CalendarEvent[];
  onDayClick: (date: Date) => void;
  onEventClick: (event: CalendarEvent) => void;
  onDrop: (date: Date, eventId: string) => void;
}) {
  const days = useMemo(() => {
    const start = startOfWeek(cursor, { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end: endOfWeek(cursor, { weekStartsOn: 1 }) });
  }, [cursor]);

  return (
    <div className="surface-card grid grid-cols-1 gap-2 overflow-hidden p-2 sm:grid-cols-7 sm:p-4">
      {days.map((date) => {
        const list = eventsOn(date);
        return (
          <button
            key={date.toISOString()}
            type="button"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              onDrop(date, e.dataTransfer.getData("text/plain"));
            }}
            onClick={() => onDayClick(date)}
            aria-label={`Voir les événements du ${format(date, "d MMMM yyyy", { locale: fr })}`}
            className={cn(
              "flex min-h-40 w-full min-w-0 flex-col justify-start overflow-hidden cursor-pointer rounded-lg border border-border/60 p-2 text-left transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              isToday(date) && "border-primary bg-primary/5",
            )}
          >
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {format(date, "EEE", { locale: fr })}
            </p>
            <p className={cn("text-sm font-bold", isToday(date) && "text-primary")}>
              {date.getDate()}
            </p>
            <div className="mt-2 w-full min-w-0 space-y-1">
              {list.map((e) => (
                <EventChip key={e.id} event={e} onClick={onEventClick} full />
              ))}
              {list.length === 0 && <p className="text-[11px] text-muted-foreground">—</p>}
            </div>
          </button>
        );
      })}
    </div>
  );
}

/* --------------------------------- Jour ----------------------------------- */
function DayView({
  cursor,
  eventsOn,
  onEventClick,
}: {
  cursor: Date;
  eventsOn: (date: Date) => CalendarEvent[];
  onEventClick: (event: CalendarEvent) => void;
}) {
  const list = eventsOn(cursor);

  return (
    <div className="surface-card p-4">
      {list.length === 0 && (
        <p className="py-10 text-center text-sm text-muted-foreground">
          Aucun événement ce jour-là.
        </p>
      )}
      <div className="space-y-2">
        {list.map((e) => (
          <button
            key={e.id}
            onClick={() => onEventClick(e)}
            className={cn(
              "flex w-full items-center gap-3 rounded-lg border p-3 text-left text-sm transition-colors hover:brightness-95",
              toneOf(e),
            )}
          >
            <span className="w-14 shrink-0 text-xs font-semibold">
              {e.overdueSince ? "⚠ Retard" : (e.time ?? "Toute la journée")}
            </span>
            <span className="flex-1 truncate font-medium">{e.title}</span>
            <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide opacity-70">
              {e.overdueSince ? `En retard depuis le ${formatShort(e.overdueSince)}` : labelOf(e)}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

/* -------------------------------- Agenda ---------------------------------- */
function AgendaView({
  events,
  onEventClick,
}: {
  events: CalendarEvent[];
  onEventClick: (event: CalendarEvent) => void;
}) {
  const grouped = useMemo(() => {
    const sorted = [...events].sort((a, b) => a.date.localeCompare(b.date) || byDayOrder(a, b));
    const map = new Map<string, CalendarEvent[]>();
    for (const e of sorted) {
      const key = e.date.slice(0, 10);
      map.set(key, [...(map.get(key) ?? []), e]);
    }
    return [...map.entries()];
  }, [events]);

  return (
    <div className="surface-card divide-y divide-border p-2 sm:p-4">
      {grouped.length === 0 && (
        <p className="py-10 text-center text-sm text-muted-foreground">Aucun événement.</p>
      )}
      {grouped.map(([day, list]) => (
        <div key={day} className="py-3">
          <p
            className={cn(
              "px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground",
              isToday(parseISO(day)) && "text-primary",
            )}
          >
            {format(parseISO(day), "EEEE d MMMM yyyy", { locale: fr })}
          </p>
          <div className="mt-2 space-y-1.5">
            {list.map((e) => (
              <button
                key={e.id}
                onClick={() => onEventClick(e)}
                className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-sm transition-colors hover:bg-accent/40"
              >
                <span className={cn("h-2 w-2 shrink-0 rounded-full", dotOf(e))} />
                <span className="w-12 shrink-0 text-xs text-muted-foreground">{e.time ?? "—"}</span>
                <span className={cn("flex-1 truncate font-medium", e.late && "text-destructive")}>
                  {e.title}
                </span>
                <span
                  className={cn(
                    "shrink-0 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground",
                    e.late && "text-destructive",
                  )}
                >
                  {e.overdueSince
                    ? `En retard depuis le ${formatShort(e.overdueSince)}`
                    : e.late
                      ? "En retard"
                      : labelOf(e)}
                </span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------ Event chip -------------------------------- */
function EventChip({
  event,
  onClick,
  full = false,
}: {
  event: CalendarEvent;
  onClick: (event: CalendarEvent) => void;
  full?: boolean;
}) {
  const draggable = isMissionEvent(event) || isRealMeeting(event);
  return (
    <p
      draggable={draggable}
      onDragStart={(e) => {
        e.stopPropagation();
        e.dataTransfer.setData("text/plain", event.id);
      }}
      onClick={(e) => {
        e.stopPropagation();
        onClick(event);
      }}
      title={
        event.overdueSince
          ? `${event.title} — en retard depuis le ${formatShort(event.overdueSince)}`
          : event.late
            ? `${event.title} — en retard`
            : event.title
      }
      className={cn(
        "truncate rounded px-1.5 py-0.5 text-[10px] font-medium",
        draggable && "cursor-grab active:cursor-grabbing",
        toneOf(event),
        event.overdueSince && "font-semibold",
        full && "whitespace-normal",
      )}
    >
      {event.overdueSince && <span className="mr-1">⚠</span>}
      {event.time && <span className="mr-1 font-semibold">{event.time}</span>}
      {event.title}
      {event.overdueSince && full && (
        <span className="block text-[10px] font-normal opacity-80">
          En retard depuis le {formatShort(event.overdueSince)}
        </span>
      )}
    </p>
  );
}

/* ---------------------------- Détail événement ----------------------------- */
function EventDetailDialog({
  event,
  onClose,
  onEdit,
  onDelete,
  deletePending,
}: {
  event: CalendarEvent | null;
  onClose: () => void;
  onEdit: (event: CalendarEvent) => void;
  onDelete: (id: string) => void;
  deletePending: boolean;
}) {
  return (
    <Dialog open={event !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        {event && (
          <>
            <DialogHeader>
              <div className="flex items-center gap-2">
                <span className={cn("h-2.5 w-2.5 rounded-full", dotOf(event))} />
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {labelOf(event)}
                </span>
              </div>
              <DialogTitle>{event.title}</DialogTitle>
              <DialogDescription>
                {format(parseISO(event.overdueSince ?? event.date), "EEEE d MMMM yyyy", {
                  locale: fr,
                })}
                {event.time && ` · ${event.time}`}
              </DialogDescription>
            </DialogHeader>
            {event.late && (
              <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">
                En retard : échéance dépassée et mission pas encore terminée. Glisse-la sur un autre
                jour du calendrier pour replanifier son échéance.
              </p>
            )}
            {/* L'aperçu d'une mission / d'un livrable dit déjà son état. */}
            {event.description && !event.mission_id && (
              <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">
                {event.description}
              </p>
            )}
            {/* Mission, livrable ou publication : aperçu et accès direct. */}
            <CalendarEventPreview event={event} onClose={onClose} />
            {isRealMeeting(event) && (
              <DialogFooter className="flex-row items-center justify-end">
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => onEdit(event)}>
                    Modifier
                  </Button>
                  <ConfirmDeleteButton
                    title="Supprimer cette réunion ?"
                    description="Cet événement sera retiré du calendrier. Cette action est irréversible."
                    pending={deletePending}
                    onConfirm={() => onDelete(event.id)}
                  />
                </div>
              </DialogFooter>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------- Événements d'une journée ------------------------ */
function DayEventsDialog({
  date,
  events,
  hiddenByFilters = 0,
  onClose,
  onEventClick,
  onAdd,
}: {
  date: Date | null;
  events: CalendarEvent[];
  hiddenByFilters?: number;
  onClose: () => void;
  onEventClick: (event: CalendarEvent) => void;
  onAdd: (date: Date) => void;
}) {
  const sorted = [...events].sort(byDayOrder);

  return (
    <Dialog open={date !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        {date && (
          <>
            <DialogHeader>
              <DialogTitle className="capitalize">
                {format(date, "EEEE d MMMM yyyy", { locale: fr })}
              </DialogTitle>
              <DialogDescription>
                {sorted.length === 0
                  ? "Aucun événement ce jour-là."
                  : `${sorted.length} événement(s)${hiddenByFilters > 0 ? " — tous types confondus, indépendamment des filtres actifs" : ""}`}
              </DialogDescription>
            </DialogHeader>
            {sorted.length > 0 && (
              <div className="max-h-80 space-y-1.5 overflow-y-auto">
                {sorted.map((e) => (
                  <button
                    key={e.id}
                    onClick={() => onEventClick(e)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-lg border p-3 text-left text-sm transition-colors hover:brightness-95",
                      toneOf(e),
                    )}
                  >
                    <span className="w-14 shrink-0 text-xs font-semibold">
                      {e.overdueSince ? "⚠ Retard" : (e.time ?? "Toute la journée")}
                    </span>
                    <span className="flex-1 truncate font-medium">{e.title}</span>
                    <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide opacity-70">
                      {e.overdueSince
                        ? `En retard depuis le ${formatShort(e.overdueSince)}`
                        : labelOf(e)}
                    </span>
                  </button>
                ))}
              </div>
            )}
            <DialogFooter>
              <Button size="sm" onClick={() => onAdd(date)}>
                <Plus className="mr-1 h-4 w-4" /> Ajouter un événement
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ----------------------------- Créer / modifier ----------------------------- */
function MeetingFormDialog({
  open,
  onOpenChange,
  event,
  defaultDate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  event: CalendarEvent | null;
  defaultDate: string | null;
}) {
  const qc = useQueryClient();
  const isEdit = event !== null;
  const titleId = useId();
  const dateId = useId();
  const timeId = useId();
  const descriptionId = useId();
  const [form, setForm] = useState({
    title: event?.title ?? "",
    date: event?.date.slice(0, 10) ?? defaultDate ?? format(new Date(), "yyyy-MM-dd"),
    time: event?.time ?? "",
    description: event?.description ?? "",
  });

  const resetFor = (e: CalendarEvent | null, date: string | null) => {
    setForm({
      title: e?.title ?? "",
      date: e?.date.slice(0, 10) ?? date ?? format(new Date(), "yyyy-MM-dd"),
      time: e?.time ?? "",
      description: e?.description ?? "",
    });
  };

  const mutation = useMutation({
    mutationFn: () => {
      const payload = {
        title: form.title.trim(),
        date: form.date,
        ...(form.time ? { time: form.time } : {}),
        ...(form.description.trim() ? { description: form.description.trim() } : {}),
      };
      return isEdit && event
        ? calendarService.updateMeeting(event.id, payload)
        : calendarService.createMeeting(payload);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["calendar"] });
      toast.success(isEdit ? "Réunion mise à jour." : "Réunion créée.");
      onOpenChange(false);
    },
    onError: (error) => toast.error(errorMessage(error, "Enregistrement impossible.")),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (o) resetFor(event, defaultDate);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Modifier la réunion" : "Nouvelle réunion"}</DialogTitle>
          <DialogDescription>
            Seules les réunions peuvent être créées directement ; les échéances de missions et
            dépôts de livrables apparaissent automatiquement.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2 space-y-1.5">
            <Label htmlFor={titleId} className="text-xs">
              Titre
            </Label>
            <Input
              id={titleId}
              value={form.title}
              maxLength={140}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={dateId} className="text-xs">
              Date
            </Label>
            <Input
              id={dateId}
              type="date"
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={timeId} className="text-xs">
              Heure (optionnel)
            </Label>
            <Input
              id={timeId}
              type="time"
              value={form.time}
              onChange={(e) => setForm({ ...form, time: e.target.value })}
            />
          </div>
          <div className="sm:col-span-2 space-y-1.5">
            <Label htmlFor={descriptionId} className="text-xs">
              Description
            </Label>
            <Textarea
              id={descriptionId}
              value={form.description}
              maxLength={500}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            disabled={!form.title.trim() || !form.date || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? "Enregistrement..." : isEdit ? "Enregistrer" : "Créer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
