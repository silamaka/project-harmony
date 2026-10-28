import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
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
import { AlertCircle, ChevronLeft, ChevronRight, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CLIENT_MISSION_STATUS_LABELS, clientMissionStatus } from "@/components/shared/badges";
import { CalendarEventPreview } from "@/components/shared/calendar-event-preview";
import { cn, searchText } from "@/lib/utils";
import {
  calendarService,
  clientService,
  isLate,
  isMissionDone,
  missionService,
  projectService,
} from "@/services";
import { useAuth } from "@/context/auth-context";
import {
  MISSION_STATUS_LABELS,
  TASK_TYPE_LABELS,
  type CalendarEvent as ApiCalendarEvent,
} from "@/types";
import { errorMessage } from "@/lib/api";

/** Événement tel qu'affiché : `late` marque une échéance de mission dépassée
 * et pas finie ; `overdueSince` marque sa copie reportée sur aujourd'hui
 * (date d'échéance d'origine). Champs purement d'affichage. */
type CalendarEvent = ApiCalendarEvent & { late?: boolean; overdueSince?: string };

type CalendarSearch = { client?: string; projet?: string };

export const Route = createFileRoute("/calendrier")({
  // Filtres client / projet dans l'adresse : un lien partagé ou un
  // rechargement garde la sélection. Paramètres facultatifs.
  validateSearch: (search: Record<string, unknown>): CalendarSearch => {
    const client = searchText(search["client"]);
    const projet = searchText(search["projet"]);
    return { ...(client ? { client } : {}), ...(projet ? { projet } : {}) };
  },
  head: () => ({
    meta: [
      { title: "Calendrier — OLYMPE" },
      {
        name: "description",
        content:
          "Vue jour, semaine, mois et agenda des échéances de missions, livrables et publications.",
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
  descente: "bg-violet-500/15 text-violet-600 border-violet-500/30 dark:text-violet-400",
};

const TYPE_DOT: Record<EventType, string> = {
  mission: "bg-primary",
  // Prévue : pastille claire ; publiée : pleine (voir dotOf).
  publication: "bg-success/40 ring-1 ring-success",
  livrable: "bg-info",
  descente: "bg-violet-500",
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
/** Publication prévue ou livrable disponible : date et heure dans le
 * fuseau du navigateur (le serveur les calcule dans le sien). */
const inLocalTime = (raw: ApiCalendarEvent): ApiCalendarEvent => {
  const at = raw.scheduled_at ?? raw.available_at;
  return at
    ? { ...raw, date: format(parseISO(at), "yyyy-MM-dd"), time: format(parseISO(at), "HH:mm") }
    : raw;
};

function withOverdueRollover(events: ApiCalendarEvent[]): CalendarEvent[] {
  const today = format(new Date(), "yyyy-MM-dd");
  const result: CalendarEvent[] = [];
  for (const raw of events) {
    const e = inLocalTime(raw);
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
/** Avancement d'une publication programmée : publiée, date dépassée sans
 * publication, ou prévue. */
function publicationProgress(e: CalendarEvent): "done" | "late" | "awaiting" | "ongoing" | null {
  if (e.type !== "publication" || !e.scheduled_at) return null;
  if (e.published_at) return "done";
  if (new Date(e.scheduled_at).getTime() < Date.now()) return "late";
  // Le client n'a pas encore validé le livrable : à mettre en avant.
  return e.awaiting_client ? "awaiting" : "ongoing";
}

/** Publication : toute l'étiquette prend la couleur de son avancement. */
const PUBLICATION_TONE = {
  done: "bg-success/15 text-success border-success/30",
  late: LATE_TONE,
  awaiting: "bg-warning/25 text-warning border-warning/60 font-semibold",
  ongoing: "bg-warning/20 text-warning border-warning/30",
} as const;

const toneOf = (e: CalendarEvent) => {
  const progress = publicationProgress(e);
  if (progress) return PUBLICATION_TONE[progress];
  return e.late ? LATE_TONE : TYPE_TONE[e.type];
};

/** Pastille sur l'étiquette : les missions seulement (une publication est
 * déjà colorée en entier). */
const showsDot = (e: CalendarEvent) => e.type !== "publication";

const dotOf = (e: CalendarEvent) =>
  e.late ? "bg-destructive" : e.published_at ? "bg-success" : TYPE_DOT[e.type];

const labelOf = (e: CalendarEvent) => (e.published_at ? "Publiée" : TYPE_LABEL[e.type]);

/** Pastille d'une échéance de mission ou d'une publication : trois couleurs
 * seulement, pour lire le calendrier d'un coup d'œil — rouge en retard
 * (échéance ou date de publication dépassée), vert fait (mission Validée,
 * Publiée ou Terminée — même règle que le dashboard — ou publication
 * effectuée), orange en cours / prévue. L'état précis reste au survol, dans
 * l'agenda et dans l'aperçu. */
const PROGRESS_DOT = {
  late: "bg-destructive",
  done: "bg-success",
  awaiting: "bg-warning",
  ongoing: "bg-warning",
} as const;

/**
 * État d'une échéance de mission tel que l'utilisateur doit le voir (le
 * client avec ses propres libellés : les étapes internes de l'agence se
 * résument à "En préparation"). Rien pour les autres événements.
 */
function useMissionStatus() {
  const { user } = useAuth();
  const isClient = user?.role === "client";
  return (e: CalendarEvent) => {
    // Publication : mêmes trois couleurs — publiée, prévue, date dépassée.
    const progress = publicationProgress(e);
    if (progress) {
      const label = {
        done: "Publiée",
        late: "Date dépassée",
        awaiting: isClient ? "À valider" : "Attente du client",
        ongoing: "Prévue",
      }[progress];
      return { label, dot: PROGRESS_DOT[progress], done: progress === "done" };
    }
    if (isClient && e.type === "livrable" && e.available_at) {
      return e.awaiting_client
        ? { label: "À valider", dot: PROGRESS_DOT.awaiting, done: false }
        : { label: "Disponible", dot: PROGRESS_DOT.done, done: true };
    }
    if (!isMissionEvent(e) || !e.status) return null;
    const done = isMissionDone(e.status);
    const dot = done ? PROGRESS_DOT.done : e.late ? PROGRESS_DOT.late : PROGRESS_DOT.ongoing;
    const label = isClient
      ? CLIENT_MISSION_STATUS_LABELS[clientMissionStatus(e.status)]
      : MISSION_STATUS_LABELS[e.status];
    return { label, dot, done };
  };
}

function StatusDot({ dot, className }: { dot: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-block h-2 w-2 shrink-0 rounded-full ring-1 ring-background",
        dot,
        className,
      )}
    />
  );
}

/** Échéance de mission (générée côté serveur, id "ev-<uuid>") : à distinguer
 * d'un livrable réellement déposé, qui partage le même `type` qu'une mission
 * taguée "Livrable". */
const isMissionEvent = (e: ApiCalendarEvent) => e.id.startsWith("ev-");

function CalendarPage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  // Le client a le même calendrier, sans les outils de l'équipe : pas de
  // déplacement d'échéance, pas de filtre client, pas de report des retards
  // (le serveur ne lui envoie que ses publications et ses descentes).
  const isClient = user?.role === "client";
  const { data: rawEvents } = useQuery({ queryKey: ["calendar"], queryFn: calendarService.list });
  const events = useMemo(
    () => (isClient ? (rawEvents ?? []).map(inLocalTime) : withOverdueRollover(rawEvents ?? [])),
    [rawEvents, isClient],
  );
  // Livrables qui attendent la validation du client, une fois chacun (un
  // livrable disponible peut aussi avoir une publication prévue) : la
  // publication d'abord, qui porte l'échéance la plus parlante.
  const awaitingClient = useMemo(() => {
    const byDeliverable = new Map<string, CalendarEvent>();
    for (const e of events) {
      if (!e.awaiting_client || e.published_at || !e.deliverable_id) continue;
      const known = byDeliverable.get(e.deliverable_id);
      if (!known || e.type === "publication") byDeliverable.set(e.deliverable_id, e);
    }
    return [...byDeliverable.values()].sort((a, b) =>
      (a.date + (a.time ?? "")).localeCompare(b.date + (b.time ?? "")),
    );
  }, [events]);
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
  const updateMissionDeadline = useMutation({
    mutationFn: ({ id, deadline }: { id: string; deadline: string }) =>
      missionService.update(id, { deadline }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["calendar"] });
      void qc.invalidateQueries({ queryKey: ["missions"] });
    },
    onError: (error) => toast.error(errorMessage(error, "Déplacement impossible.")),
  });

  // Filtres client / projet (dans l'adresse).
  const { client: clientFilter, projet: projectFilter } = Route.useSearch();
  const navigate = useNavigate({ from: "/calendrier" });
  const setClientFilter = (client: string) =>
    void navigate({ search: client ? { client } : {}, replace: true });
  const setProjectFilter = (projet: string) =>
    void navigate({
      search: {
        ...(clientFilter && !isClient ? { client: clientFilter } : {}),
        ...(projet ? { projet } : {}),
      },
      replace: true,
    });
  const { data: clients } = useQuery({ queryKey: ["clients"], queryFn: clientService.list });
  const { data: projects } = useQuery({ queryKey: ["projects"], queryFn: projectService.list });
  // Tous les clients (même sans mission : le calendrier est alors vide), et
  // tous les projets du client choisi.
  const clientOptions = useMemo(
    () => [...(clients ?? [])].sort((a, b) => a.name.localeCompare(b.name)),
    [clients],
  );
  // Projets du client choisi ; pour un client, les siens.
  const projectsOf = isClient ? user?.client_id : clientFilter;
  const projectOptions = useMemo(
    () =>
      projectsOf
        ? (projects ?? [])
            .filter((p) => p.client_id === projectsOf)
            .sort((a, b) => a.name.localeCompare(b.name))
        : [],
    [projects, projectsOf],
  );
  // Le client a tous les types : ses missions, livrables disponibles,
  // publications et descentes (le serveur ne lui envoie que les siens).
  const typeOptions = Object.keys(TYPE_LABEL) as EventType[];
  const typeLabel = (t: EventType) =>
    isClient && t === "livrable" ? "Livrable disponible" : TYPE_LABEL[t];

  /** Le backend ne renvoie déjà que les événements de mission/livrable visibles pour le rôle courant. */
  const visibleEvents = useMemo(
    () =>
      events.filter(
        (e) =>
          (typeFilter === "tous" || e.type === typeFilter) &&
          e.title.toLowerCase().includes(query.toLowerCase()) &&
          (!clientFilter || e.client_id === clientFilter) &&
          (!projectFilter || e.project_id === projectFilter),
      ),
    [events, typeFilter, query, clientFilter, projectFilter],
  );
  const selectedClientName = clientOptions.find((c) => c.id === clientFilter)?.name;
  const clientEventCount = visibleEvents.length;

  const eventsOn = (date: Date) =>
    visibleEvents.filter((e) => isSameDay(parseISO(e.date), date)).sort(byDayOrder);
  /** Volontairement non filtré : cliquer sur une date doit montrer tout ce qui s'y passe, même si des filtres masquent certains types sur la grille. */
  const allEventsOn = (date: Date) =>
    events.filter((e) => isSameDay(parseISO(e.date), date)).sort(byDayOrder);

  const handleDrop = (date: Date, eventId: string) => {
    if (isClient) return;
    const ev = visibleEvents.find((e) => e.id === eventId);
    if (!ev) return;
    const iso = format(date, "yyyy-MM-dd");
    if (isMissionEvent(ev) && ev.mission_id) {
      updateMissionDeadline.mutate({ id: ev.mission_id, deadline: iso });
    }
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

        {!isClient && (
          <select
            aria-label="Filtrer par client"
            value={clientFilter ?? ""}
            onChange={(e) => setClientFilter(e.target.value)}
            className={cn(
              "h-9 rounded-md border border-input bg-background px-3 text-sm",
              clientFilter && "border-primary text-primary",
            )}
          >
            <option value="">Tous les clients</option>
            {clientOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        )}
        {/* Projet : seulement pour un client qui en a plusieurs. */}
        {projectOptions.length >= 2 && (
          <select
            aria-label="Filtrer par projet"
            value={projectFilter ?? ""}
            onChange={(e) => setProjectFilter(e.target.value)}
            className={cn(
              "h-9 rounded-md border border-input bg-background px-3 text-sm",
              projectFilter && "border-primary text-primary",
            )}
          >
            <option value="">Tous les projets</option>
            {projectOptions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        )}

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
          {typeOptions.map((t) => (
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
              {typeLabel(t)}
            </button>
          ))}
        </div>
      </div>

      {isClient && awaitingClient.length > 0 && (
        <button
          type="button"
          onClick={() => setSelected(awaitingClient[0]!)}
          className="mt-3 flex w-full items-center gap-3 rounded-xl border border-warning/40 bg-warning/10 p-3 text-left text-sm transition hover:border-warning/70"
        >
          <AlertCircle className="h-5 w-5 shrink-0 text-warning" />
          <span className="min-w-0 flex-1">
            <span className="font-semibold">
              {awaitingClient.length} livrable
              {awaitingClient.length > 1 ? "s attendent" : " attend"} votre validation.
            </span>{" "}
            <span className="text-muted-foreground">
              {awaitingClient[0]!.type === "publication"
                ? `Publication la plus proche : ${awaitingClient[0]!.title}, le ${format(parseISO(awaitingClient[0]!.date), "d MMMM", { locale: fr })}.`
                : `Le plus ancien : ${awaitingClient[0]!.title}, disponible depuis le ${format(parseISO(awaitingClient[0]!.date), "d MMMM", { locale: fr })}.`}
            </span>
          </span>
        </button>
      )}

      {selectedClientName && (
        <p className="mt-3 text-xs text-muted-foreground">
          {clientEventCount} événement{clientEventCount > 1 ? "s" : ""} pour{" "}
          <span className="font-medium text-foreground">{selectedClientName}</span>
          {projectFilter &&
            ` · projet « ${projectOptions.find((p) => p.id === projectFilter)?.name ?? ""} »`}{" "}
          ·{" "}
          <button
            type="button"
            onClick={() => setClientFilter("")}
            className="font-medium text-primary hover:underline"
          >
            Tous les clients
          </button>
        </p>
      )}

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

      <EventDetailDialog event={selected} onClose={() => setSelected(null)} />

      <DayEventsDialog
        date={dayView}
        events={dayView ? allEventsOn(dayView) : []}
        hiddenByFilters={dayView ? allEventsOn(dayView).length - eventsOn(dayView).length : 0}
        onClose={() => setDayView(null)}
        onEventClick={(e) => {
          setDayView(null);
          setSelected(e);
        }}
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
  const statusOf = useMissionStatus();
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
            {statusOf(e) && showsDot(e) && <StatusDot dot={statusOf(e)!.dot} />}
            <span className="flex-1 truncate font-medium">{e.title}</span>
            <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide opacity-70">
              {e.overdueSince
                ? `En retard depuis le ${formatShort(e.overdueSince)}`
                : (statusOf(e)?.label ?? labelOf(e))}
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
  const statusOf = useMissionStatus();
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
                <span
                  className={cn("h-2 w-2 shrink-0 rounded-full", statusOf(e)?.dot ?? dotOf(e))}
                />
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
                      : (statusOf(e)?.label ?? labelOf(e))}
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
  const status = useMissionStatus()(event);
  const { user } = useAuth();
  const draggable = isMissionEvent(event) && user?.role !== "client";
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
      title={[
        event.title,
        status?.label,
        event.overdueSince
          ? `en retard depuis le ${formatShort(event.overdueSince)}`
          : event.late
            ? "en retard"
            : null,
      ]
        .filter(Boolean)
        .join(" — ")}
      className={cn(
        "truncate rounded px-1.5 py-0.5 text-[10px] font-medium",
        draggable && "cursor-grab active:cursor-grabbing",
        toneOf(event),
        event.overdueSince && "font-semibold",
        // Vue semaine : retour à la ligne, y compris dans un nom sans espace
        // (ex. une adresse e-mail), pour que la pastille reste collée au nom.
        full && "w-full whitespace-normal [overflow-wrap:anywhere]",
      )}
    >
      {/* Pastille dans sa propre colonne : elle reste collée au nom, même
          quand celui-ci passe à la ligne (vue semaine). */}
      <span className={cn(full && "flex items-start gap-1")}>
        {status && showsDot(event) && (
          <StatusDot dot={status.dot} className={cn(full ? "mt-[3px]" : "mr-1 align-middle")} />
        )}
        <span className={cn(full && "min-w-0")}>
          {event.overdueSince && <span className="mr-1">⚠</span>}
          {event.time && <span className="mr-1 font-semibold">{event.time}</span>}
          {event.title}
        </span>
      </span>
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
}: {
  event: CalendarEvent | null;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const isClient = user?.role === "client";
  const label = (e: CalendarEvent) =>
    isClient && e.available_at
      ? "Livrable disponible"
      : isClient && e.type === "mission"
        ? "Livraison prévue"
        : labelOf(e);
  return (
    <Dialog open={event !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        {event && (
          <>
            <DialogHeader>
              <div className="flex items-center gap-2">
                <span className={cn("h-2.5 w-2.5 rounded-full", dotOf(event))} />
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {label(event)}
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
            {/* Mission, livrable ou publication : aperçu et accès direct. */}
            <CalendarEventPreview event={event} onClose={onClose} />
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
}: {
  date: Date | null;
  events: CalendarEvent[];
  hiddenByFilters?: number;
  onClose: () => void;
  onEventClick: (event: CalendarEvent) => void;
}) {
  const statusOf = useMissionStatus();
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
                    {statusOf(e) && showsDot(e) && <StatusDot dot={statusOf(e)!.dot} />}
                    <span className="flex-1 truncate font-medium">{e.title}</span>
                    <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide opacity-70">
                      {e.overdueSince
                        ? `En retard depuis le ${formatShort(e.overdueSince)}`
                        : (statusOf(e)?.label ?? labelOf(e))}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
