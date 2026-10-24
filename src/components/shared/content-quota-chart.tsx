import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { addMonths, format, parse, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { dashboardService } from "@/services";

const MONTH_FORMAT = "yyyy-MM";

type QuotaRow = Awaited<ReturnType<typeof dashboardService.contentQuota>>["clients"][number];
type Row = QuotaRow & { total: number };

/** État court affiché en pastille à côté du compteur. */
function rowStatus(row: Row, isCurrent: boolean) {
  if (row.total > row.quota) return { label: "Hors forfait", tone: "warning" as const };
  if (row.quota > 0 && row.total >= row.quota)
    return { label: "Atteint", tone: "success" as const };
  // Mois terminé sans avoir atteint le forfait.
  if (!isCurrent && row.total < row.quota)
    return { label: "Sous le forfait", tone: "warning" as const };
  return null;
}

/** Résumé chiffré (fenêtre du client, lecteurs d'écran). */
function rowDetail(row: Row) {
  return `${row.total}/${row.quota} contenus`;
}

/** Une case par contenu : vert = déposé avec lien, gris = annoncé sans lien,
 *  pointillé = encore à produire pour tenir le forfait du mois. */
export function ContentQuotaChart() {
  const now = new Date();
  const current = format(now, MONTH_FORMAT);
  const [month, setMonth] = useState(current);
  const [selected, setSelected] = useState<Row | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard", "content-quota", month],
    queryFn: () => dashboardService.contentQuota(month),
  });
  const monthDate = parse(month, MONTH_FORMAT, new Date());
  const shift = (delta: number) => setMonth(format(addMonths(monthDate, delta), MONTH_FORMAT));
  const isCurrent = month === current;
  const fill = (r: Row) => (r.quota ? r.total / r.quota : 1);

  const rows: Row[] = (data?.clients ?? [])
    .map((row) => ({ ...row, total: row.with_link + row.without_link }))
    // Les moins avancés sur leur forfait d'abord.
    .sort((a, b) => fill(a) - fill(b) || a.name.localeCompare(b.name, "fr"));
  const totals = rows.reduce(
    (acc, r) => ({ done: acc.done + r.total, quota: acc.quota + r.quota }),
    { done: 0, quota: 0 },
  );

  return (
    <div className="surface-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">Contenus du mois</h2>
          <p className="text-xs text-muted-foreground">Par client, face au forfait mensuel.</p>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            aria-label="Mois précédent"
            onClick={() => shift(-1)}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-28 text-center text-xs font-medium capitalize">
            {format(monthDate, "MMMM yyyy", { locale: fr })}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            aria-label="Mois suivant"
            disabled={month >= current}
            onClick={() => shift(1)}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-[3px] bg-success" /> Avec lien
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-[3px] bg-muted-foreground/35" /> Sans lien
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-[3px] border border-dashed border-muted-foreground/50" />{" "}
          À produire
        </span>
      </div>

      <div className="mt-4 max-h-80 space-y-1 overflow-y-auto pr-1">
        {isLoading && <p className="text-xs text-muted-foreground">Chargement...</p>}
        {!isLoading && rows.length === 0 && (
          <p className="text-xs text-muted-foreground">Aucun client actif ce mois-ci.</p>
        )}
        {rows.map((row) => (
          <QuotaBar
            key={row.client_id}
            row={row}
            isCurrent={isCurrent}
            onOpen={() => setSelected(row)}
          />
        ))}
      </div>

      {rows.length > 1 && (
        <p className="mt-3 border-t pt-3 text-xs text-muted-foreground">
          Agence <span className="font-semibold text-foreground">{totals.done}</span>/{totals.quota}
        </p>
      )}

      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{selected?.name}</DialogTitle>
            <DialogDescription>
              <span className="capitalize">{format(monthDate, "MMMM yyyy", { locale: fr })}</span>
              {selected && ` · ${rowDetail(selected)}`}
            </DialogDescription>
          </DialogHeader>
          {selected?.deliverables.length ? (
            <ul className="max-h-[60vh] divide-y overflow-y-auto">
              {selected.deliverables.map((d) => (
                <li key={d.id} className="flex items-center gap-3 py-2.5">
                  <span
                    className={cn(
                      "h-3 w-3 shrink-0 rounded-[3px]",
                      d.has_link ? "bg-success" : "bg-muted-foreground/35",
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    {d.can_open ? (
                      <Link
                        to="/missions/$missionId"
                        params={{ missionId: d.mission_id }}
                        className="block truncate text-sm font-medium hover:underline"
                      >
                        {d.name}
                      </Link>
                    ) : (
                      <p className="truncate text-sm font-medium">{d.name}</p>
                    )}
                    <p className="truncate text-xs text-muted-foreground">
                      {d.mission_title} · déposé le {format(parseISO(d.created_at), "dd/MM")}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "shrink-0 text-[11px]",
                      d.has_link ? "text-success" : "text-muted-foreground",
                    )}
                  >
                    {d.has_link ? "Avec lien" : "Lien manquant"}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Aucun livrable déposé ce mois-ci.</p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function QuotaBar({
  row,
  isCurrent,
  onOpen,
}: {
  row: Row;
  isCurrent: boolean;
  onOpen: () => void;
}) {
  const { total, quota } = row;
  const status = rowStatus(row, isCurrent);
  const cells = Math.max(quota, total);

  return (
    <button
      type="button"
      onClick={onOpen}
      className="block w-full rounded-lg px-2 py-2 text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-x-3 text-xs">
        <span className="truncate font-medium">{row.name}</span>
        <span className="flex items-center gap-2">
          <span className="font-semibold tabular-nums">
            {total}/{quota}
          </span>
          {status && (
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[10px] font-semibold",
                status.tone === "warning"
                  ? "bg-warning/15 text-warning-foreground dark:text-warning"
                  : "bg-success/15 text-success",
              )}
            >
              {status.label}
            </span>
          )}
        </span>
      </div>
      {cells === 0 ? (
        <p className="text-[11px] text-muted-foreground">Pas de forfait défini.</p>
      ) : (
        <div className="flex h-5 gap-0.5" role="img" aria-label={`${row.name} : ${rowDetail(row)}`}>
          {Array.from({ length: cells }, (_, i) => (
            <span
              key={i}
              title={row.deliverables[i]?.name}
              className={cn(
                "min-w-0 flex-1 rounded-[3px]",
                i < row.with_link
                  ? "bg-success"
                  : i < total
                    ? "bg-muted-foreground/35"
                    : "border border-dashed border-muted-foreground/40",
                // Au-delà du forfait : contenus en plus, soulignés.
                i >= quota && "ring-1 ring-warning ring-offset-1 ring-offset-card",
              )}
            />
          ))}
        </div>
      )}
    </button>
  );
}
