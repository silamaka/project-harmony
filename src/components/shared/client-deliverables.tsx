import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  CheckCircle2,
  Eye,
  FileArchive,
  FileText,
  Film,
  ImageIcon,
  LinkIcon,
  Megaphone,
  Pencil,
  Search,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  DELIVERABLE_STATES,
  DeliverableStateBadge,
  awaitsCorrectedVersion,
  isSentToClient,
  deliverableBorderTone,
  deliverableRowTone,
  deliverableState,
  hasDeliverableLink,
  type DeliverableState,
} from "@/components/shared/badges";
import { DeliverableDecision } from "@/components/shared/deliverable-decision";
import { DeliverableFeedback } from "@/components/shared/deliverable-feedback";
import { EditDeliverableDialog } from "@/components/shared/edit-dialogs";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/context/auth-context";
import { cn } from "@/lib/utils";
import { deliverableService } from "@/services";
import type { Deliverable, DeliverableType, Mission, User } from "@/types";

const TYPE_ICON: Record<DeliverableType, typeof FileText> = {
  pdf: FileText,
  image: ImageIcon,
  zip: FileArchive,
  video: Film,
  lien: LinkIcon,
};

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
 * par le backend). Mêmes actions et mêmes droits que sur la fiche mission :
 * valider = admin/chef de projet, publier = l'agence (un collaborateur ne
 * voit ici que ses missions, il peut donc publier tout ce qu'il voit),
 * modifier = admin/chef de projet ou l'auteur. Sans lien ("Lien à venir"),
 * seul Modifier reste proposé : rien à ouvrir, valider ni publier.
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
  const { user, hasRole } = useAuth();
  const canValidate = hasRole("admin", "chef_projet");
  const canPublish = hasRole("admin", "chef_projet", "collaborateur");
  /** Nom / lien : admin, chef de projet, ou le collaborateur auteur du dépôt. */
  const canEdit = (d: Deliverable) =>
    hasRole("admin", "chef_projet") || (hasRole("collaborateur") && d.uploaded_by === user?.id);
  const qc = useQueryClient();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("tous");
  const [editing, setEditing] = useState<Deliverable | null>(null);

  const refresh = () => void qc.invalidateQueries({ queryKey: ["deliverables"] });

  const publish = useMutation({
    mutationFn: ({ id, published }: { id: string; published: boolean }) =>
      deliverableService.setPublished(id, published),
    onSuccess: (_d, { published }) => {
      refresh();
      toast.success(published ? "Livrable marqué comme publié." : "Publication annulée.");
    },
    onError: () => toast.error("Mise à jour de la publication impossible."),
  });

  const validate = useMutation({
    mutationFn: ({ id, status }: { id: string; status: Deliverable["status"] }) =>
      deliverableService.updateStatus(id, status),
    onSuccess: (_d, { status }) => {
      refresh();
      // La mission suit la validation côté serveur.
      void qc.invalidateQueries({ queryKey: ["missions"] });
      toast.success(
        status === "valide" ? "Livrable validé et envoyé au client." : "Envoi au client retiré.",
      );
    },
    onError: () => toast.error("Mise à jour du statut impossible."),
  });

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

  /** Actions d'un livrable, identiques en carte (mobile) et en tableau. */
  const renderActions = (d: Deliverable) => (
    <>
      {canEdit(d) && (
        <button
          type="button"
          onClick={() => setEditing(d)}
          aria-label={`Modifier ${d.name}`}
          title={hasDeliverableLink(d) ? "Modifier" : "Ajouter le lien"}
          className="text-muted-foreground hover:text-primary"
        >
          <Pencil className="h-4 w-4" />
        </button>
      )}
      {hasDeliverableLink(d) && (
        <a
          href={d.url}
          target="_blank"
          rel="noreferrer"
          aria-label={`Voir ${d.name}`}
          title="Ouvrir"
          className="text-muted-foreground hover:text-primary"
        >
          <Eye className="h-4 w-4" />
        </a>
      )}
      {canValidate && isSentToClient(d) && (
        <DeliverableDecision deliverable={d} onBehalf variant="icons" />
      )}
      {canPublish && hasDeliverableLink(d) && (
        <button
          type="button"
          onClick={() => publish.mutate({ id: d.id, published: !d.published_at })}
          disabled={publish.isPending}
          aria-label={d.published_at ? `Annuler la publication de ${d.name}` : `Publier ${d.name}`}
          title={d.published_at ? "Publié — cliquer pour annuler" : "Marquer comme publié"}
          className={cn(
            "text-muted-foreground hover:text-primary",
            d.published_at && "text-primary",
          )}
        >
          <Megaphone className="h-4 w-4" />
        </button>
      )}
      {canValidate && hasDeliverableLink(d) && !awaitsCorrectedVersion(d) && (
        <button
          type="button"
          onClick={() =>
            validate.mutate({
              id: d.id,
              status: d.status === "valide" ? "en_attente" : "valide",
            })
          }
          disabled={validate.isPending}
          aria-label={
            d.status === "valide" ? `Retirer l'envoi de ${d.name}` : `Valider et envoyer ${d.name}`
          }
          title={
            d.status === "valide"
              ? "Validé et envoyé au client — cliquer pour retirer"
              : "Valider et envoyer au client"
          }
          className={cn(
            "text-muted-foreground hover:text-success",
            d.status === "valide" && "text-success",
          )}
        >
          <CheckCircle2 className="h-4 w-4" />
        </button>
      )}
    </>
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
        {list.map((d) => {
          const Icon = TYPE_ICON[d.type];
          const mission = missionById.get(d.mission_id);
          const state = deliverableState(d);
          return (
            <div
              key={d.id}
              className={cn(
                "min-w-0 rounded-xl border border-l-4 border-border p-3",
                deliverableRowTone[state],
                deliverableBorderTone[state],
              )}
            >
              <div className="flex items-start gap-2">
                <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium break-words">{d.name}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {hasDeliverableLink(d) ? `v${d.version}` : "Lien pas encore disponible"}
                  </p>
                </div>
                <DeliverableStateBadge deliverable={d} />
              </div>
              <DeliverableFeedback
                deliverable={d}
                className="mt-2"
                onFix={canEdit(d) ? () => setEditing(d) : undefined}
              />
              {mission && (
                <Link
                  to="/missions/$missionId"
                  params={{ missionId: mission.id }}
                  className="mt-2 block truncate text-sm text-primary hover:underline"
                >
                  {mission.title}
                </Link>
              )}
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
                <p className="min-w-0 flex-1 text-xs text-muted-foreground">
                  Déposé par {nameOf(d.uploaded_by)} le {formatDate(d.created_at)}
                </p>
                <div className="flex items-center gap-4">{renderActions(d)}</div>
              </div>
            </div>
          );
        })}
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
                const Icon = TYPE_ICON[d.type];
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
                          <p className="truncate font-medium">{d.name}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {hasDeliverableLink(d) ? `v${d.version}` : "Lien pas encore disponible"}
                          </p>
                        </div>
                      </div>
                      <DeliverableFeedback
                        deliverable={d}
                        className="mt-2 max-w-md"
                        onFix={canEdit(d) ? () => setEditing(d) : undefined}
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
                      <div className="flex items-center justify-end gap-3">{renderActions(d)}</div>
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
