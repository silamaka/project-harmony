import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { FileArchive, FileText, Image as ImageIcon, Link2, Video } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/app-shell";
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

function DeliverablesPage() {
  const [q, setQ] = useState("");
  const { data: deliverables } = useQuery({
    queryKey: ["deliverables"],
    queryFn: deliverableService.list,
  });
  const { data: missions } = useQuery({ queryKey: ["missions"], queryFn: missionService.list });
  const { data: users } = useQuery({ queryKey: ["users"], queryFn: userService.list });

  const list = (deliverables ?? []).filter((d) =>
    d.name.toLowerCase().includes(q.trim().toLowerCase()),
  );

  return (
    <AppShell
      title="Livrables"
      subtitle={`${deliverables?.length ?? 0} fichier(s) déposé(s)`}
      allow={["admin", "chef_projet", "collaborateur"]}
    >
      <Input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Rechercher un livrable…"
        className="max-w-sm"
      />

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
              {mission && (
                <Link
                  to="/missions/$missionId"
                  params={{ missionId: mission.id }}
                  className="truncate text-xs font-medium text-primary hover:underline"
                >
                  {mission.title}
                </Link>
              )}
              <p className="text-xs text-muted-foreground">
                Déposé par {author ? `${author.first_name} ${author.last_name}` : "—"} le{" "}
                {new Date(d.created_at).toLocaleDateString("fr-FR")}
              </p>
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
