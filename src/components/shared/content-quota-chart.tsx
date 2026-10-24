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
// Une case = 12 px de haut + 2 px d'écart : l'axe Y se cale sur cette grille.
const CELL_PX = 12;
const UNIT_PX = CELL_PX + 2;
// Colonnes partagées par les barres et les noms de l'axe X : elles se
// répartissent toute la largeur de la carte, sans défilement.
const COLUMN_CLASS = "min-w-0 flex-1 px-0.5";
const AXIS_CLASS = "relative w-8 shrink-0";

/** Graduations de l'axe Y : de 0 au plus haut, par pas lisible. */
function yTicks(max: number) {
  const step = max <= 20 ? 4 : max <= 50 ? 10 : 20;
  const ticks = [];
  for (let v = 0; v <= max; v += step) ticks.push(v);
  return ticks;
}

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
 *  gris pâle = encore à produire pour tenir le forfait du mois, orange =
 *  contenus au-delà du forfait. */
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

  const rows: Row[] = (data?.clients ?? [])
    .map((row) => ({ ...row, total: row.with_link + row.without_link }))
    // Les clients qui ont le plus de livrables ce mois-ci d'abord.
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, "fr"));
  const maxCells = Math.max(1, ...rows.map((r) => Math.max(r.quota, r.total)));
  const ticks = yTicks(maxCells);
  // Position d'une valeur sur l'axe : le haut de sa case.
  const tickBottom = (v: number) => (v === 0 ? 0 : v * UNIT_PX - 2);
  const totals = rows.reduce(
    (acc, r) => ({ done: acc.done + r.total, quota: acc.quota + r.quota }),
    { done: 0, quota: 0 },
  );
  const anyOver = rows.some((r) => r.total > r.quota);

  return (
    <div className="surface-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">
            Contenus du mois
            {rows.length > 1 && (
              <span className="font-normal text-muted-foreground">
                {" "}
                · {totals.done}/{totals.quota}
              </span>
            )}
          </h2>
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
          <span className="h-2.5 w-2.5 rounded-[3px] bg-muted" /> À produire
        </span>
        {anyOver && (
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-[3px] bg-warning" /> Hors forfait
          </span>
        )}
      </div>

      {isLoading && <p className="mt-4 text-xs text-muted-foreground">Chargement...</p>}
      {!isLoading && rows.length === 0 && (
        <p className="mt-4 text-xs text-muted-foreground">Aucun client actif ce mois-ci.</p>
      )}
      {rows.length > 0 && (
        // Axe Y (contenus) à gauche, axe X (clients) en bas, noms en
        // oblique : tout tient dans la carte, les colonnes se resserrent.
        <div className="mt-4">
          <span className="mb-1 block text-[10px] text-muted-foreground">Contenus</span>
          <div className="flex items-end">
            {/* Au-dessus de la ligne des noms : le "0" déborde sous l'axe. */}
            <div className={cn(AXIS_CLASS, "z-30")}>
              <div
                className="relative border-r border-border"
                style={{ height: maxCells * UNIT_PX - 2 }}
              >
                {ticks.map((v) => (
                  <span
                    key={v}
                    className="absolute right-1.5 translate-y-1/2 text-[10px] tabular-nums text-muted-foreground"
                    style={{ bottom: tickBottom(v) }}
                  >
                    {v}
                  </span>
                ))}
              </div>
            </div>
            <div className="relative flex min-w-0 flex-1 items-end border-b border-border">
              {/* Lignes de repère, derrière les colonnes. */}
              {ticks
                .filter((v) => v > 0)
                .map((v) => (
                  <span
                    key={v}
                    aria-hidden
                    className="pointer-events-none absolute inset-x-0 border-t border-border/50"
                    style={{ bottom: tickBottom(v) }}
                  />
                ))}
              {rows.map((row) => (
                <QuotaColumn
                  key={row.client_id}
                  row={row}
                  isCurrent={isCurrent}
                  onOpen={() => setSelected(row)}
                />
              ))}
            </div>
          </div>
          {/* Axe X : noms en oblique, ancrés sous leur colonne et cliquables
              comme elle ; le nom complet s'affiche au survol. */}
          <div className="flex">
            <div className={AXIS_CLASS} />
            <div className="flex min-w-0 flex-1">
              {rows.map((row) => (
                <div key={row.client_id} className={cn(COLUMN_CLASS, "relative h-24 sm:h-16")}>
                  <button
                    type="button"
                    title={row.name}
                    onClick={() => setSelected(row)}
                    className="absolute right-1/2 top-1.5 max-w-24 origin-top-right -rotate-[60deg] truncate sm:-rotate-[35deg] whitespace-nowrap text-[11px] font-medium hover:underline"
                  >
                    {row.name}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{selected?.name}</DialogTitle>
            <DialogDescription>
              <span className="capitalize">{format(monthDate, "MMMM yyyy", { locale: fr })}</span>
              {selected && ` · ${rowDetail(selected)}`}
              {selected &&
                rowStatus(selected, isCurrent) &&
                ` · ${rowStatus(selected, isCurrent)!.label}`}
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

function QuotaColumn({
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
      title={status ? `${row.name} · ${status.label}` : row.name}
      className={cn(
        COLUMN_CLASS,
        "relative z-10 flex flex-col items-center gap-1.5 rounded-t-md pt-2 transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      )}
    >
      {/* Compteur : vert forfait atteint, orange hors forfait ou sous le forfait. */}
      <span
        className={cn(
          "whitespace-nowrap text-[10px] font-semibold tabular-nums sm:text-xs",
          status?.tone === "success" && "text-success",
          status?.tone === "warning" && "text-amber-600 dark:text-warning",
        )}
      >
        {total}
        {/* Sur téléphone, colonnes étroites : le nombre seul. */}
        <span className="hidden sm:inline">/{quota}</span>
      </span>
      {cells === 0 ? (
        <span className="pb-1 text-[10px] text-muted-foreground">Pas de forfait</span>
      ) : (
        <div
          className="flex w-full max-w-6 flex-col-reverse gap-0.5"
          role="img"
          aria-label={`${row.name} : ${rowDetail(row)}`}
        >
          {Array.from({ length: cells }, (_, i) => (
            <span
              key={i}
              title={row.deliverables[i]?.name}
              style={{ height: CELL_PX }}
              className={cn(
                "w-full rounded-[2px]",
                // Au-delà du forfait : contenus en plus, en orange.
                i >= quota
                  ? "bg-warning"
                  : i < row.with_link
                    ? "bg-success"
                    : i < total
                      ? "bg-muted-foreground/35"
                      : "bg-muted",
              )}
            />
          ))}
        </div>
      )}
    </button>
  );
}
