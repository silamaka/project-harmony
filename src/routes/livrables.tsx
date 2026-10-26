import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { AlertTriangle, Clock, Megaphone, Package, Send } from "lucide-react";
import { useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import {
  DELIVERABLE_STATE_LABELS,
  deliverableState,
  type DeliverableState,
} from "@/components/shared/badges";
import { DeliverableCard } from "@/components/shared/deliverable-card";
import { EditDeliverableDialog } from "@/components/shared/edit-dialogs";
import { StatCard } from "@/components/shared/stat-card";
import { Input } from "@/components/ui/input";
import { deliverableService, missionService, userService } from "@/services";
import type { Deliverable } from "@/types";
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

type Filter = "tous" | Exclude<DeliverableState, "a_venir">;
const FILTERS: Filter[] = ["tous", "en_attente", "envoye", "corrections", "pret", "publie"];
const FILTER_LABELS: Record<Filter, string> = {
  tous: "Tous",
  ...DELIVERABLE_STATE_LABELS,
};

function DeliverablesPage() {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("tous");
  // Carte de statistique : filtre la liste, un second clic le retire.
  const toggleFilter = (f: Filter) => setFilter(filter === f ? "tous" : f);
  const [editing, setEditing] = useState<Deliverable | null>(null);
  const { data: deliverables } = useQuery({
    queryKey: ["deliverables"],
    queryFn: deliverableService.list,
  });
  const { data: missions } = useQuery({ queryKey: ["missions"], queryFn: missionService.list });
  const { data: users } = useQuery({ queryKey: ["users"], queryFn: userService.list });

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
        <StatCard
          label="Livrables"
          value={stats.total}
          icon={Package}
          active={filter === "tous"}
          onClick={() => setFilter("tous")}
        />
        <StatCard
          label="En revue agence"
          value={stats.enRevue}
          icon={Clock}
          tone="warning"
          delay={0.04}
          active={filter === "en_attente"}
          onClick={() => toggleFilter("en_attente")}
        />
        <StatCard
          label="Chez le client"
          value={stats.chezLeClient}
          icon={Send}
          delay={0.08}
          active={filter === "envoye"}
          onClick={() => toggleFilter("envoye")}
        />
        {/* Validés par le client : c'est le prochain travail de l'agence. */}
        <StatCard
          label="À publier"
          value={stats.aPublier}
          icon={Megaphone}
          tone="success"
          delay={0.1}
          active={filter === "pret"}
          onClick={() => toggleFilter("pret")}
        />
        <StatCard
          label="Corrections"
          value={stats.corrections}
          icon={AlertTriangle}
          tone="danger"
          delay={0.12}
          active={filter === "corrections"}
          onClick={() => toggleFilter("corrections")}
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
          const author = users?.find((u) => u.id === d.uploaded_by);
          return (
            <DeliverableCard
              key={d.id}
              deliverable={d}
              onEdit={setEditing}
              mission={missions?.find((m) => m.id === d.mission_id)}
              authorName={author ? `${author.first_name} ${author.last_name}` : "—"}
              showReviewButtons
            />
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
