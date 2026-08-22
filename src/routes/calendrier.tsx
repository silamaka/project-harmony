import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
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
import { useId, useMemo, useState } from "react";
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
import { ConfirmDeleteButton } from "@/components/shared/edit-dialogs";
import { cn } from "@/lib/utils";
import { calendarService, missionService } from "@/services";
import type { CalendarEvent } from "@/types";

export const Route = createFileRoute("/calendrier")({
  head: () => ({
    meta: [
      { title: "Calendrier — BEBA EMPIRE" },
      {
        name: "description",
        content:
          "Vue jour, semaine, mois et agenda des échéances de missions, livrables et réunions.",
      },
      { property: "og:title", content: "Calendrier — BEBA EMPIRE" },
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
  livrable: "bg-info/15 text-info border-info/20",
  reunion: "bg-warning/20 text-warning border-warning/30",
};

const TYPE_DOT: Record<EventType, string> = {
  mission: "bg-primary",
  livrable: "bg-info",
  reunion: "bg-warning",
};

const TYPE_LABEL: Record<EventType, string> = {
  mission: "Mission",
  livrable: "Livrable",
  reunion: "Réunion",
};

function CalendarPage() {
  const qc = useQueryClient();
  const { data: events } = useQuery({ queryKey: ["calendar"], queryFn: calendarService.list });
  const [view, setView] = useState<ViewMode>("mois");
  const [cursor, setCursor] = useState(() => new Date());
  const [query, setQuery] = useState("");
  const [activeTypes, setActiveTypes] = useState<Set<EventType>>(
    new Set<EventType>(["mission", "livrable", "reunion"]),
  );
  const [selected, setSelected] = useState<CalendarEvent | null>(null);
  const [dayView, setDayView] = useState<Date | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [formEvent, setFormEvent] = useState<CalendarEvent | null>(null);
  const [formDate, setFormDate] = useState<string | null>(null);

  const updateMeeting = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<CalendarEvent> }) =>
      calendarService.updateMeeting(id, patch),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["calendar"] }),
    onError: () => toast.error("Déplacement impossible."),
  });

  const removeMeeting = useMutation({
    mutationFn: (id: string) => calendarService.removeMeeting(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["calendar"] });
      toast.success("Réunion supprimée.");
      setSelected(null);
    },
    onError: () => toast.error("Suppression impossible."),
  });

  const updateMissionDeadline = useMutation({
    mutationFn: ({ id, deadline }: { id: string; deadline: string }) =>
      missionService.update(id, { deadline }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["calendar"] });
      void qc.invalidateQueries({ queryKey: ["missions"] });
    },
    onError: () => toast.error("Déplacement impossible."),
  });

  const toggleType = (t: EventType) => {
    setActiveTypes((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  };

  /** Le backend ne renvoie déjà que les événements de mission/livrable visibles pour le rôle courant. */
  const visibleEvents = useMemo(
    () =>
      (events ?? []).filter(
        (e) => activeTypes.has(e.type) && e.title.toLowerCase().includes(query.toLowerCase()),
      ),
    [events, activeTypes, query],
  );

  const eventsOn = (date: Date) => visibleEvents.filter((e) => isSameDay(parseISO(e.date), date));
  /** Volontairement non filtré : cliquer sur une date doit montrer tout ce qui s'y passe, même si des filtres masquent certains types sur la grille. */
  const allEventsOn = (date: Date) =>
    (events ?? []).filter((e) => isSameDay(parseISO(e.date), date));

  const handleDrop = (date: Date, eventId: string) => {
    const ev = visibleEvents.find((e) => e.id === eventId);
    if (!ev) return;
    const iso = format(date, "yyyy-MM-dd");
    if (ev.type === "mission" && ev.mission_id) {
      updateMissionDeadline.mutate({ id: ev.mission_id, deadline: iso });
    } else if (ev.type === "reunion") {
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
        <div className="flex items-center gap-2">
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
          {(Object.keys(TYPE_LABEL) as EventType[]).map((t) => (
            <button
              key={t}
              onClick={() => toggleType(t)}
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                activeTypes.has(t)
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
            <div
              key={date.toISOString()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                onDrop(date, e.dataTransfer.getData("text/plain"));
              }}
              onClick={() => onDayClick(date)}
              className={cn(
                "min-h-24 cursor-pointer rounded-lg border border-border/60 p-1.5 text-left transition-colors hover:border-primary/40",
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
              <div className="mt-1 space-y-1">
                {list.slice(0, 3).map((e) => (
                  <EventChip key={e.id} event={e} onClick={onEventClick} />
                ))}
                {list.length > 3 && (
                  <p className="px-1 text-[10px] text-muted-foreground">
                    +{list.length - 3} autre(s)
                  </p>
                )}
              </div>
            </div>
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
          <div
            key={date.toISOString()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              onDrop(date, e.dataTransfer.getData("text/plain"));
            }}
            onClick={() => onDayClick(date)}
            className={cn(
              "min-h-40 cursor-pointer rounded-lg border border-border/60 p-2 text-left transition-colors hover:border-primary/40",
              isToday(date) && "border-primary bg-primary/5",
            )}
          >
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {format(date, "EEE", { locale: fr })}
            </p>
            <p className={cn("text-sm font-bold", isToday(date) && "text-primary")}>
              {date.getDate()}
            </p>
            <div className="mt-2 space-y-1">
              {list.map((e) => (
                <EventChip key={e.id} event={e} onClick={onEventClick} full />
              ))}
              {list.length === 0 && <p className="text-[11px] text-muted-foreground">—</p>}
            </div>
          </div>
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
  const list = eventsOn(cursor).sort((a, b) => (a.time ?? "").localeCompare(b.time ?? ""));

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
              TYPE_TONE[e.type],
            )}
          >
            <span className="w-14 shrink-0 text-xs font-semibold">
              {e.time ?? "Toute la journée"}
            </span>
            <span className="flex-1 truncate font-medium">{e.title}</span>
            <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide opacity-70">
              {TYPE_LABEL[e.type]}
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
    const sorted = [...events].sort(
      (a, b) => a.date.localeCompare(b.date) || (a.time ?? "").localeCompare(b.time ?? ""),
    );
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
                <span className={cn("h-2 w-2 shrink-0 rounded-full", TYPE_DOT[e.type])} />
                <span className="w-12 shrink-0 text-xs text-muted-foreground">{e.time ?? "—"}</span>
                <span className="flex-1 truncate font-medium">{e.title}</span>
                <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {TYPE_LABEL[e.type]}
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
  const draggable = event.type === "mission" || event.type === "reunion";
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
      title={event.title}
      className={cn(
        "truncate rounded px-1.5 py-0.5 text-[10px] font-medium",
        draggable && "cursor-grab active:cursor-grabbing",
        TYPE_TONE[event.type],
        full && "whitespace-normal",
      )}
    >
      {event.time && <span className="mr-1 font-semibold">{event.time}</span>}
      {event.title}
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
      <DialogContent className="sm:max-w-md">
        {event && (
          <>
            <DialogHeader>
              <div className="flex items-center gap-2">
                <span className={cn("h-2.5 w-2.5 rounded-full", TYPE_DOT[event.type])} />
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {TYPE_LABEL[event.type]}
                </span>
              </div>
              <DialogTitle>{event.title}</DialogTitle>
              <DialogDescription>
                {format(parseISO(event.date), "EEEE d MMMM yyyy", { locale: fr })}
                {event.time && ` · ${event.time}`}
              </DialogDescription>
            </DialogHeader>
            {event.description && (
              <p className="text-sm text-muted-foreground">{event.description}</p>
            )}
            <DialogFooter className="flex-row items-center justify-between sm:justify-between">
              {event.mission_id ? (
                <Link
                  to="/missions/$missionId"
                  params={{ missionId: event.mission_id }}
                  onClick={onClose}
                  className="text-xs font-medium text-primary hover:underline"
                >
                  Voir la mission →
                </Link>
              ) : (
                <span />
              )}
              {event.type === "reunion" && (
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
              )}
            </DialogFooter>
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
  const sorted = [...events].sort((a, b) => (a.time ?? "").localeCompare(b.time ?? ""));

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
                      TYPE_TONE[e.type],
                    )}
                  >
                    <span className="w-14 shrink-0 text-xs font-semibold">
                      {e.time ?? "Toute la journée"}
                    </span>
                    <span className="flex-1 truncate font-medium">{e.title}</span>
                    <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide opacity-70">
                      {TYPE_LABEL[e.type]}
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
    onError: () => toast.error("Enregistrement impossible."),
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
