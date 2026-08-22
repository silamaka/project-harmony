import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Eye,
  FileArchive,
  FileText,
  Image as ImageIcon,
  Link2,
  Package,
  Video,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/app-shell";
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
      { title: "Livrables — BEBA EMPIRE" },
      {
        name: "description",
        content: "Bibliothèque des livrables : versions, statuts de validation et téléchargement.",
      },
      { property: "og:title", content: "Livrables — BEBA EMPIRE" },
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

const STATUS_TONE: Record<Deliverable["status"], string> = {
  en_attente: "bg-warning/20 text-warning",
  valide: "bg-success/15 text-success",
  corrections: "bg-destructive/12 text-destructive",
};

const STATUS_LABEL: Record<Deliverable["status"], string> = {
  en_attente: "En attente",
  valide: "Validé",
  corrections: "Corrections",
};

const FILTERS = ["tous", "en_attente", "valide", "corrections"] as const;
const FILTER_LABELS: Record<(typeof FILTERS)[number], string> = {
  tous: "Tous",
  en_attente: "En attente",
  valide: "Validé",
  corrections: "Corrections",
};

function DeliverablesPage() {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("tous");
  const { hasRole } = useAuth();
  const canValidate = hasRole("admin", "chef_projet");
  const queryClient = useQueryClient();
  const { data: deliverables } = useQuery({
    queryKey: ["deliverables"],
    queryFn: deliverableService.list,
  });
  const { data: missions } = useQuery({ queryKey: ["missions"], queryFn: missionService.list });
  const { data: users } = useQuery({ queryKey: ["users"], queryFn: userService.list });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: Deliverable["status"] }) =>
      deliverableService.updateStatus(id, status),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["deliverables"] });
      toast.success(variables.status === "valide" ? "Livrable validé." : "Corrections demandées.");
    },
  });

  /** Le backend ne renvoie déjà que les livrables visibles pour le rôle courant. */
  const visible = deliverables ?? [];
  const list = visible.filter(
    (d) =>
      d.name.toLowerCase().includes(q.trim().toLowerCase()) &&
      (filter === "tous" || d.status === filter),
  );

  const stats = {
    total: visible.length,
    enAttente: visible.filter((d) => d.status === "en_attente").length,
    valides: visible.filter((d) => d.status === "valide").length,
    corrections: visible.filter((d) => d.status === "corrections").length,
  };

  return (
    <AppShell
      title="Livrables"
      subtitle={`${visible.length} fichier(s) déposé(s)`}
      allow={["admin", "chef_projet", "collaborateur"]}
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Livrables" value={stats.total} icon={Package} />
        <StatCard
          label="En attente"
          value={stats.enAttente}
          icon={Clock}
          tone="warning"
          delay={0.04}
        />
        <StatCard
          label="Validés"
          value={stats.valides}
          icon={CheckCircle2}
          tone="success"
          delay={0.08}
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
        <div className="flex gap-1 rounded-lg border border-border p-1">
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
                    v{d.version} · {d.size_kb ? `${d.size_kb} Ko` : d.type.toUpperCase()}
                  </p>
                </div>
                <span
                  className={cn(
                    "rounded-full px-2.5 py-0.5 text-xs font-semibold",
                    STATUS_TONE[d.status],
                  )}
                >
                  {STATUS_LABEL[d.status]}
                </span>
              </div>
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
                <Button variant="outline" size="sm" className="ml-auto shrink-0" asChild>
                  <a href={d.url} target="_blank" rel="noreferrer">
                    <Eye className="h-4 w-4" /> Ouvrir
                  </a>
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Déposé par {author ? `${author.first_name} ${author.last_name}` : "—"} le{" "}
                {new Date(d.created_at).toLocaleDateString("fr-FR")}
              </p>
              {canValidate && (
                <div className="flex gap-2 border-t border-border pt-3">
                  <Button
                    size="sm"
                    className="flex-1"
                    disabled={d.status === "valide" || statusMutation.isPending}
                    onClick={() => statusMutation.mutate({ id: d.id, status: "valide" })}
                  >
                    Valider
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
    </AppShell>
  );
}
