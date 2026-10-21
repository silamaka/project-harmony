import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  Clock,
  Megaphone,
  Eye,
  FileArchive,
  FileText,
  Image as ImageIcon,
  Link2,
  Package,
  Pencil,
  Send,
  Trash2,
  Video,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/app-shell";
import {
  DELIVERABLE_STATE_LABELS,
  awaitsCorrectedVersion,
  isSentToClient,
  DeliverableStateBadge,
  deliverableState,
  hasDeliverableLink,
  type DeliverableState,
} from "@/components/shared/badges";
import { DeliverableDecision } from "@/components/shared/deliverable-decision";
import { DeliverableFeedback } from "@/components/shared/deliverable-feedback";
import { EditDeliverableDialog } from "@/components/shared/edit-dialogs";
import { StatCard } from "@/components/shared/stat-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/context/auth-context";
import { deliverableService, missionService, userService } from "@/services";
import type { Deliverable, DeliverableType } from "@/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/livrables")({
  head: () => ({
    meta: [
      { title: "Livrables — OLYMPE" },
      {
        name: "description",
        content: "Bibliothèque des livrables : versions, statuts de validation et téléchargement.",
      },
      { property: "og:title", content: "Livrables — OLYMPE" },
      { property: "og:description", content: "Tous les fichiers livrés par l'agence, versionnés." },
    ],
  }),
  component: DeliverablesPage,
});

const ICONS: Record<DeliverableType, typeof FileText> = {
  pdf: FileText,
  image: ImageIcon,
  zip: FileArchive,
  video: Video,
  lien: Link2,
};

type Filter = "tous" | Exclude<DeliverableState, "a_venir">;
const FILTERS: Filter[] = ["tous", "en_attente", "envoye", "corrections", "pret", "publie"];
const FILTER_LABELS: Record<Filter, string> = {
  tous: "Tous",
  ...DELIVERABLE_STATE_LABELS,
};

function DeliverablesPage() {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("tous");
  const { user, hasRole } = useAuth();
  const canValidate = hasRole("admin", "chef_projet");
  /** Modifier (nom / lien) et supprimer : admin, chef de projet, ou l'auteur. */
  const canDelete = (d: Deliverable) =>
    hasRole("admin", "chef_projet") || d.uploaded_by === user?.id;
  const [editing, setEditing] = useState<Deliverable | null>(null);
  const queryClient = useQueryClient();
  const { data: deliverables } = useQuery({
    queryKey: ["deliverables"],
    queryFn: deliverableService.list,
  });
  const { data: missions } = useQuery({ queryKey: ["missions"], queryFn: missionService.list });
  const { data: users } = useQuery({ queryKey: ["users"], queryFn: userService.list });

  // Validation agence : "valide" envoie le livrable au client (notifié côté
  // serveur) ; la mission suit côté serveur.
  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: Deliverable["status"] }) =>
      deliverableService.updateStatus(id, status),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["deliverables"] });
      queryClient.invalidateQueries({ queryKey: ["missions"] });
      toast.success(
        variables.status === "valide"
          ? "Livrable validé et envoyé au client."
          : "Corrections demandées à l'équipe.",
      );
    },
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => deliverableService.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["deliverables"] });
      queryClient.invalidateQueries({ queryKey: ["missions"] });
      toast.success("Livrable supprimé.");
    },
    onError: () => toast.error("Suppression impossible."),
  });

  /** Le backend ne renvoie déjà que les livrables visibles pour le rôle courant. */
  const visible = deliverables ?? [];
  const list = visible.filter(
    (d) =>
      d.name.toLowerCase().includes(q.trim().toLowerCase()) &&
      (filter === "tous" || deliverableState(d) === filter),
  );

  const countState = (state: DeliverableState) =>
    visible.filter((d) => deliverableState(d) === state).length;
  const stats = {
    total: visible.length,
    enRevue: countState("en_attente"),
    chezLeClient: countState("envoye"),
    corrections: countState("corrections"),
    aPublier: countState("pret"),
  };

  return (
    <AppShell
      title="Livrables"
      subtitle={`${visible.length} fichier(s) déposé(s)`}
      allow={["admin", "chef_projet", "collaborateur"]}
    >
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-5">
        <StatCard label="Livrables" value={stats.total} icon={Package} />
        <StatCard
          label="En revue agence"
          value={stats.enRevue}
          icon={Clock}
          tone="warning"
          delay={0.04}
        />
        <StatCard label="Chez le client" value={stats.chezLeClient} icon={Send} delay={0.08} />
        {/* Validés par le client : c'est le prochain travail de l'agence. */}
        <StatCard
          label="À publier"
          value={stats.aPublier}
          icon={Megaphone}
          tone="success"
          delay={0.1}
          active={filter === "pret"}
          onClick={() => setFilter(filter === "pret" ? "tous" : "pret")}
        />
        <StatCard
          label="Corrections"
          value={stats.corrections}
          icon={AlertTriangle}
          tone="danger"
          delay={0.12}
        />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Rechercher un livrable…"
          className="max-w-sm"
        />
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
              {FILTER_LABELS[f]}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {list.map((d) => {
          const Icon = ICONS[d.type];
          const mission = missions?.find((m) => m.id === d.mission_id);
          const author = users?.find((u) => u.id === d.uploaded_by);
          return (
            <div key={d.id} className="surface-card flex flex-col gap-3 p-4">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{d.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {hasDeliverableLink(d)
                      ? `v${d.version} · ${d.size_kb ? `${d.size_kb} Ko` : d.type.toUpperCase()}`
                      : "Lien pas encore disponible"}
                  </p>
                </div>
                <DeliverableStateBadge deliverable={d} />
              </div>
              <DeliverableFeedback
                deliverable={d}
                onFix={canDelete(d) ? () => setEditing(d) : undefined}
              />
              <div className="flex items-center gap-3">
                {mission && (
                  <Link
                    to="/missions/$missionId"
                    params={{ missionId: mission.id }}
                    className="min-w-0 truncate text-xs font-medium text-primary hover:underline"
                  >
                    {mission.title}
                  </Link>
                )}
                {hasDeliverableLink(d) ? (
                  <Button variant="outline" size="sm" className="ml-auto shrink-0" asChild>
                    <a href={d.url} target="_blank" rel="noreferrer">
                      <Eye className="h-4 w-4" /> Ouvrir
                    </a>
                  </Button>
                ) : (
                  <span className="ml-auto" />
                )}
                {canValidate && isSentToClient(d) && (
                  <DeliverableDecision deliverable={d} onBehalf variant="icons" />
                )}
                {canDelete(d) && (
                  <button
                    type="button"
                    onClick={() => setEditing(d)}
                    aria-label={`Modifier ${d.name}`}
                    title={hasDeliverableLink(d) ? "Modifier" : "Ajouter le lien"}
                    className="shrink-0 text-muted-foreground hover:text-primary"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                )}
                {canDelete(d) && (
                  <button
                    type="button"
                    onClick={() => removeMutation.mutate(d.id)}
                    disabled={removeMutation.isPending}
                    aria-label={`Supprimer ${d.name}`}
                    className="shrink-0 text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Déposé par {author ? `${author.first_name} ${author.last_name}` : "—"} le{" "}
                {new Date(d.created_at).toLocaleDateString("fr-FR")}
              </p>
              {/* Envoyé au client : seule sa réponse fait avancer (icônes
                  "pour le client" sur la ligne d'actions). */}
              {canValidate &&
                hasDeliverableLink(d) &&
                !awaitsCorrectedVersion(d) &&
                !isSentToClient(d) && (
                  <div className="flex gap-2 border-t border-border pt-3">
                    <Button
                      size="sm"
                      className="flex-1"
                      disabled={d.status === "valide" || statusMutation.isPending}
                      onClick={() => statusMutation.mutate({ id: d.id, status: "valide" })}
                    >
                      {d.status === "valide" ? "Envoyé au client" : "Valider et envoyer"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1"
                      disabled={d.status === "corrections" || statusMutation.isPending}
                      onClick={() => statusMutation.mutate({ id: d.id, status: "corrections" })}
                    >
                      Corrections
                    </Button>
                  </div>
                )}
            </div>
          );
        })}
        {list.length === 0 && (
          <p className="text-sm text-muted-foreground">Aucun livrable trouvé.</p>
        )}
      </div>
      <EditDeliverableDialog deliverable={editing} onOpenChange={(o) => !o && setEditing(null)} />
    </AppShell>
  );
}
