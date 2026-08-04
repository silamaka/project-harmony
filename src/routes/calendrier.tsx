import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { calendarService } from "@/services";
import type { CalendarEvent } from "@/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/calendrier")({
  head: () => ({
    meta: [
      { title: "Calendrier — BEBA EMPIRE" },
      {
        name: "description",
        content: "Vue mensuelle des échéances de missions, livrables et réunions de l'agence.",
      },
      { property: "og:title", content: "Calendrier — BEBA EMPIRE" },
      { property: "og:description", content: "Planning mensuel des échéances de l'agence." },
    ],
  }),
  component: CalendarPage,
});

const DAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

const TYPE_TONE: Record<CalendarEvent["type"], string> = {
  mission: "bg-primary/10 text-primary",
  livrable: "bg-info/15 text-info",
  reunion: "bg-warning/20 text-warning",
};

const TYPE_LABEL: Record<CalendarEvent["type"], string> = {
  mission: "Mission",
  livrable: "Livrable",
  reunion: "Réunion",
};

function CalendarPage() {
  const { data: events } = useQuery({ queryKey: ["calendar"], queryFn: calendarService.list });
  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const cells = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const offset = (first.getDay() + 6) % 7; // lundi = 0
    const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
    const out: (Date | null)[] = Array.from({ length: offset }, () => null);
    for (let d = 1; d <= daysInMonth; d += 1) {
      out.push(new Date(cursor.getFullYear(), cursor.getMonth(), d));
    }
    while (out.length % 7 !== 0) out.push(null);
    return out;
  }, [cursor]);

  const byDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const e of events ?? []) {
      const key = new Date(e.date).toDateString();
      map.set(key, [...(map.get(key) ?? []), e]);
    }
    return map;
  }, [events]);

  const today = new Date().toDateString();

  return (
    <AppShell
      title="Calendrier"
      subtitle={cursor.toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}
      actions={
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            aria-label="Mois précédent"
            onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            aria-label="Mois suivant"
            onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      }
    >
      <div className="surface-card overflow-hidden p-2 sm:p-4">
        <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {DAYS.map((d) => (
            <div key={d} className="py-2">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((date, i) => {
            const list = date ? (byDay.get(date.toDateString()) ?? []) : [];
            return (
              <div
                key={i}
                className={cn(
                  "min-h-24 rounded-lg border border-border/60 p-1.5 text-left",
                  !date && "border-transparent bg-transparent",
                  date && date.toDateString() === today && "border-primary bg-primary/5",
                )}
              >
                {date && (
                  <>
                    <span className="text-xs font-semibold text-muted-foreground">
                      {date.getDate()}
                    </span>
                    <div className="mt-1 space-y-1">
                      {list.slice(0, 3).map((e) => (
                        <p
                          key={e.id}
                          title={e.title}
                          className={cn(
                            "truncate rounded px-1.5 py-0.5 text-[10px] font-medium",
                            TYPE_TONE[e.type],
                          )}
                        >
                          {e.title}
                        </p>
                      ))}
                      {list.length > 3 && (
                        <p className="px-1 text-[10px] text-muted-foreground">
                          +{list.length - 3} autre(s)
                        </p>
                      )}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-3 text-xs text-muted-foreground">
        {(Object.keys(TYPE_LABEL) as CalendarEvent["type"][]).map((t) => (
          <span key={t} className="flex items-center gap-2">
            <span className={cn("h-3 w-3 rounded", TYPE_TONE[t])} />
            {TYPE_LABEL[t]}
          </span>
        ))}
      </div>
    </AppShell>
  );
}
