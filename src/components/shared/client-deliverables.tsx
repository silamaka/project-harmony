import { Link } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import {
  DELIVERABLE_STATES,
  DeliverableStateBadge,
  deliverableRowTone,
  deliverableState,
  type DeliverableState,
} from "@/components/shared/badges";
import {
  DELIVERABLE_TYPE_ICON,
  DeliverableActions,
  DeliverableCard,
  DeliverableTitle,
  useDeliverablePermissions,
} from "@/components/shared/deliverable-card";
import { DeliverableFeedback } from "@/components/shared/deliverable-feedback";
import { EditDeliverableDialog } from "@/components/shared/edit-dialogs";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { Deliverable, Mission, User } from "@/types";

type Filter = "tous" | DeliverableState;
const FILTERS: Filter[] = ["tous", ...DELIVERABLE_STATES];
const FILTER_LABELS: Record<Filter, string> = {
  tous: "Tous",
  a_venir: "Lien à venir",
  en_attente: "En revue agence",
  corrections: "Corrections",
  envoye: "Chez le client",
  pret: "Prêt à publier",
  publie: "Publiés",
};

/** Ordre d'affichage : un livrable validé des deux côtés mais pas encore
 * publié remonte en tête (prochaine action), puis Corrections, En revue
 * agence, Chez le client, les livrables encore sans lien, et les publiés en
 * bas ; à état égal, le plus récent en premier. */
const SORT_ORDER: DeliverableState[] = [
  "pret",
  "corrections",
  "en_attente",
  "envoye",
  "a_venir",
  "publie",
];

const matchesFilter = (d: Deliverable, filter: Filter) =>
  filter === "tous" || deliverableState(d) === filter;

const formatDate = (iso: string) => new Date(iso).toLocaleDateString("fr-FR");

/**
 * Tous les livrables d'un client (onglet "Livrables" de la fiche client),
 * publiés ou non. `deliverables` et `missions` sont déjà restreints au
 * client et, pour un collaborateur, à ses propres missions (portée imposée
 * par le backend). Cartes et actions partagées avec la fiche mission et la
 * page Livrables (deliverable-card) ; pas de suppression ici, elle se fait
 * depuis la mission.
 */
export function ClientDeliverables({
  deliverables,
  missions,
  users,
}: {
  deliverables: Deliverable[];
  missions: Mission[];
  users: User[];
}) {
  const { canManage } = useDeliverablePermissions();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("tous");
  const [editing, setEditing] = useState<Deliverable | null>(null);

  const missionById = useMemo(() => new Map(missions.map((m) => [m.id, m])), [missions]);
  const nameOf = (id: string) => {
    const u = users.find((x) => x.id === id);
    return u ? `${u.first_name} ${u.last_name}` : "—";
  };

  const counts = Object.fromEntries(
    FILTERS.map((f) => [f, deliverables.filter((d) => matchesFilter(d, f)).length]),
  ) as Record<Filter, number>;

  const list = deliverables
    .filter((d) => {
      const q = query.trim().toLowerCase();
      const missionTitle = missionById.get(d.mission_id)?.title.toLowerCase() ?? "";
      return (
        matchesFilter(d, filter) && (d.name.toLowerCase().includes(q) || missionTitle.includes(q))
      );
    })
    .sort(
      (a, b) =>
        SORT_ORDER.indexOf(deliverableState(a)) - SORT_ORDER.indexOf(deliverableState(b)) ||
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-56 flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Rechercher un livrable ou une mission..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap gap-1 rounded-lg border border-border p-1">
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                filter === f
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent",
              )}
            >
              {FILTER_LABELS[f]} ({counts[f]})
            </button>
          ))}
        </div>
      </div>

      {/* Téléphone et tablette : une carte par livrable (le tableau cachait
          l'état et les actions derrière un défilement horizontal). */}
      <div className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-2 xl:hidden">
        {list.map((d) => (
          <DeliverableCard
            key={d.id}
            deliverable={d}
            onEdit={setEditing}
            mission={missionById.get(d.mission_id)}
            authorName={nameOf(d.uploaded_by)}
            allowDelete={false}
          />
        ))}
        {list.length === 0 && (
          <p className="surface-card px-3 py-10 text-center text-sm text-muted-foreground md:col-span-2">
            {deliverables.length === 0
              ? "Aucun livrable pour ce client."
              : "Aucun livrable pour ce filtre."}
          </p>
        )}
      </div>

      <div className="surface-card mt-4 hidden overflow-hidden xl:block">
        <div className="max-h-[70vh] overflow-auto">
          <table className="w-full min-w-[860px] border-collapse text-sm">
            <thead>
              <tr className="sticky top-0 z-10 bg-muted text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground shadow-[inset_0_-1px_0_var(--color-border)] [&>th]:px-3 [&>th]:py-3 [&>th]:whitespace-nowrap">
                <th>Livrable</th>
                <th>Mission</th>
                <th>Déposé par</th>
                <th>Déposé le</th>
                <th>État</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {list.map((d) => {
                const Icon = DELIVERABLE_TYPE_ICON[d.type];
                const mission = missionById.get(d.mission_id);
                return (
                  <tr
                    key={d.id}
                    className={cn(
                      "border-t border-border align-middle transition-colors hover:brightness-[0.98]",
                      deliverableRowTone[deliverableState(d)],
                    )}
                  >
                    <td className="px-3 py-2.5">
                      <div className="flex min-w-0 items-center gap-2">
                        <Icon className="h-4 w-4 shrink-0 text-primary" />
                        <div className="min-w-0">
                          <DeliverableTitle deliverable={d} />
                        </div>
                      </div>
                      <DeliverableFeedback
                        deliverable={d}
                        className="mt-2 max-w-md"
                        onFix={canManage(d) ? () => setEditing(d) : undefined}
                      />
                    </td>
                    <td className="px-3 py-2.5">
                      {mission ? (
                        <Link
                          to="/missions/$missionId"
                          params={{ missionId: mission.id }}
                          className="text-primary hover:underline"
                        >
                          {mission.title}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground">{nameOf(d.uploaded_by)}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-muted-foreground">
                      {formatDate(d.created_at)}
                    </td>
                    <td className="px-3 py-2.5">
                      <DeliverableStateBadge deliverable={d} />
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex justify-end">
                        <DeliverableActions
                          deliverable={d}
                          onEdit={setEditing}
                          allowDelete={false}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
              {list.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-10 text-center text-sm text-muted-foreground">
                    {deliverables.length === 0
                      ? "Aucun livrable pour ce client."
                      : "Aucun livrable pour ce filtre."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <EditDeliverableDialog deliverable={editing} onOpenChange={(o) => !o && setEditing(null)} />
    </div>
  );
}
