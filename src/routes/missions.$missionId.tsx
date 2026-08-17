import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  CheckCircle2,
  Eye,
  FileText,
  Film,
  ImageIcon,
  LinkIcon,
  Send,
  Trash2,
  Upload,
  FileArchive,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/app-shell";
import { MissionStatusBadge, PriorityBadge } from "@/components/shared/badges";
import { ConfirmDeleteButton, EditMissionDialog } from "@/components/shared/edit-dialogs";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/context/auth-context";
import { cn } from "@/lib/utils";
import { commentService, deliverableService, missionService, userService } from "@/services";
import {
  MISSION_WORKFLOW,
  MISSION_STATUS_LABELS,
  type DeliverableType,
  type MissionStatus,
} from "@/types";

export const Route = createFileRoute("/missions/$missionId")({
  head: () => ({
    meta: [
      { title: "Détail mission — BEBA EMPIRE" },
      { name: "description", content: "Brief, livrables, discussion et workflow de la mission." },
      { property: "og:title", content: "Détail mission — BEBA EMPIRE" },
      { property: "og:description", content: "Toute la mission au même endroit." },
    ],
  }),
  component: MissionDetailPage,
});

const typeIcon: Record<DeliverableType, typeof FileText> = {
  pdf: FileText,
  image: ImageIcon,
  zip: FileArchive,
  video: Film,
  lien: LinkIcon,
};

function MissionDetailPage() {
  const { missionId } = Route.useParams();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [draft, setDraft] = useState("");
  const [newLink, setNewLink] = useState("");
  const [pendingStatus, setPendingStatus] = useState<MissionStatus | null>(null);

  const { data: mission } = useQuery({
    queryKey: ["missions", missionId],
    queryFn: () => missionService.get(missionId),
  });
  const { data: deliverables } = useQuery({
    queryKey: ["deliverables", missionId],
    queryFn: () => deliverableService.byMission(missionId),
  });
  const { data: comments } = useQuery({
    queryKey: ["comments", missionId],
    queryFn: () => commentService.byMission(missionId),
  });
  const { data: users } = useQuery({ queryKey: ["users"], queryFn: userService.list });

  const refresh = (keys: string[][]) =>
    keys.forEach((key) => void qc.invalidateQueries({ queryKey: key }));

  const statusMutation = useMutation({
    mutationFn: (status: MissionStatus) => missionService.updateStatus(missionId, status),
    onSuccess: (_d, status) => {
      refresh([["missions"], ["missions", missionId]]);
      toast.success(`Statut : ${MISSION_STATUS_LABELS[status]}`);
    },
  });

  const commentMutation = useMutation({
    mutationFn: (body: string) =>
      commentService.create({
        mission_id: missionId,
        author_id: user?.id ?? "",
        body,
      }),
    onSuccess: () => {
      refresh([["comments", missionId]]);
      setDraft("");
      toast.success("Commentaire publié.");
    },
  });

  const deliverableMutation = useMutation({
    mutationFn: (payload: { name: string; url: string; type: DeliverableType; size_kb?: number }) =>
      deliverableService.create({
        mission_id: missionId,
        name: payload.name,
        type: payload.type,
        url: payload.url,
        ...(payload.size_kb !== undefined ? { size_kb: payload.size_kb } : {}),
        version: ((deliverables ?? []).length || 0) + 1,
        uploaded_by: user?.id ?? "",
        status: "en_attente",
      }),
    onSuccess: () => {
      refresh([["deliverables", missionId], ["deliverables"]]);
      setNewLink("");
      toast.success("Livrable ajouté.");
    },
    onError: () => toast.error("Dépôt impossible."),
  });

  const deliverableStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: "valide" | "corrections" | "en_attente" }) =>
      deliverableService.updateStatus(id, status),
    onSuccess: () => {
      refresh([["deliverables", missionId], ["deliverables"]]);
      toast.success("Statut du livrable mis à jour.");
    },
  });

  const navigate = useNavigate();
  const removeDeliverable = useMutation({
    mutationFn: (id: string) => deliverableService.remove(id),
    onSuccess: () => {
      refresh([["deliverables", missionId], ["deliverables"]]);
      toast.success("Livrable supprimé.");
    },
  });

  const removeMission = useMutation({
    mutationFn: () => missionService.remove(missionId),
    onSuccess: () => {
      toast.success("Mission supprimée.");
      // On invalide "missions" seulement une fois la navigation terminée : sinon la requête
      // ["missions", missionId] encore montée se refetch sur une fiche déjà supprimée et échoue
      // (queryFn qui retourne undefined), ce qui laisse la page dans un état incohérent.
      void navigate({ to: "/missions" }).then(() => refresh([["missions"]]));
    },
    onError: () => toast.error("Suppression impossible."),
  });

  const authorName = (id: string) => {
    const u = users?.find((x) => x.id === id);
    return u ? `${u.first_name} ${u.last_name}` : "Utilisateur";
  };

  const currentIndex = mission ? MISSION_WORKFLOW.indexOf(mission.status) : -1;
  const canManage = user?.role === "admin" || user?.role === "chef_projet";

  const requestStatusChange = (status: MissionStatus) => {
    if (!mission || status === mission.status) return;
    const distance = Math.abs(MISSION_WORKFLOW.indexOf(status) - currentIndex);
    if (distance > 1) setPendingStatus(status);
    else statusMutation.mutate(status);
  };

  return (
    <AppShell
      title={mission?.title ?? "Mission"}
      subtitle={mission?.objective}
      actions={
        mission && canManage ? (
          <div className="flex items-center gap-2">
            <EditMissionDialog key={mission.id} mission={mission} />
            <ConfirmDeleteButton
              title="Supprimer cette mission ?"
              description="La mission et son suivi seront retirés du tableau. Action irréversible."
              pending={removeMission.isPending}
              onConfirm={() => removeMission.mutate()}
            />
          </div>
        ) : undefined
      }
    >
      {/* Workflow */}
      <div className="surface-card mt-4 overflow-x-auto p-4">
        <div className="flex min-w-[760px] items-stretch gap-2">
          {MISSION_WORKFLOW.slice(0, 5).map((s, i) => (
            <StepButton
              key={s}
              label={MISSION_STATUS_LABELS[s]}
              active={mission?.status === s}
              filled={i <= currentIndex}
              disabled={statusMutation.isPending}
              onClick={() => requestStatusChange(s)}
            />
          ))}

          <div className="flex flex-1 flex-col gap-1">
            <p className="text-center text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
              Décision client
            </p>
            <div className="flex flex-1 gap-1">
              <StepButton
                label="Validé"
                active={mission?.status === "valide"}
                filled={mission?.status === "valide" || mission?.status === "termine"}
                disabled={statusMutation.isPending}
                onClick={() => requestStatusChange("valide")}
                tone="success"
              />
              <StepButton
                label="Corrections"
                active={mission?.status === "corrections"}
                filled={mission?.status === "corrections"}
                disabled={statusMutation.isPending}
                onClick={() => requestStatusChange("corrections")}
                tone="warning"
              />
            </div>
          </div>

          <StepButton
            label="Terminé"
            active={mission?.status === "termine"}
            filled={mission?.status === "termine"}
            disabled={statusMutation.isPending}
            onClick={() => requestStatusChange("termine")}
          />
        </div>
      </div>

      <Dialog open={pendingStatus !== null} onOpenChange={(o) => !o && setPendingStatus(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Passer directement à "{pendingStatus ? MISSION_STATUS_LABELS[pendingStatus] : ""}" ?
            </DialogTitle>
            <DialogDescription>
              Les étapes intermédiaires du workflow seront ignorées. Confirme si c'est bien voulu.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingStatus(null)}>
              Annuler
            </Button>
            <Button
              disabled={statusMutation.isPending}
              onClick={() => {
                if (pendingStatus) statusMutation.mutate(pendingStatus);
                setPendingStatus(null);
              }}
            >
              Confirmer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <div className="surface-card p-5 lg:col-span-2">
          <div className="flex flex-wrap items-center gap-2">
            {mission && <PriorityBadge priority={mission.priority} />}
            {mission && <MissionStatusBadge status={mission.status} />}
            <span className="text-xs text-muted-foreground">
              Deadline : {mission && new Date(mission.deadline).toLocaleDateString("fr-FR")}
            </span>
          </div>
          <Section title="Description" body={mission?.description} />
          <Section title="Objectif" body={mission?.objective} />
          <Section title="Stratégie" body={mission?.strategy} />
          <Section title="Ressources" body={mission?.resources} />
        </div>

        <div className="surface-card p-5">
          <h2 className="text-sm font-semibold">Livrables</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Colle le lien du fichier (Drive, Figma, S3...), puis clique sur Déposer.
          </p>

          <div className="mt-3 flex items-center gap-2">
            <Input
              value={newLink}
              onChange={(e) => setNewLink(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newLink.trim() && !deliverableMutation.isPending) {
                  deliverableMutation.mutate({
                    name: newLink.trim().split("/").filter(Boolean).pop() ?? "Livrable",
                    url: newLink.trim(),
                    type: "lien",
                  });
                }
              }}
              placeholder="Lien du livrable (Drive, Figma, S3...)"
              className="h-9"
            />
            <Button
              size="sm"
              variant={newLink.trim() ? "default" : "outline"}
              disabled={!newLink.trim() || deliverableMutation.isPending}
              onClick={() =>
                deliverableMutation.mutate({
                  name: newLink.trim().split("/").filter(Boolean).pop() ?? "Livrable",
                  url: newLink.trim(),
                  type: "lien",
                })
              }
              className="shrink-0"
            >
              Déposer
            </Button>
          </div>
          <ul className="mt-4 space-y-2">
            {(deliverables ?? []).map((d) => {
              const Icon = typeIcon[d.type];
              return (
                <li
                  key={d.id}
                  className="flex items-center gap-3 rounded-lg border border-border px-3 py-2.5"
                >
                  <Icon className="h-4 w-4 shrink-0 text-primary" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{d.name}</p>
                    <p className="text-[11px] text-muted-foreground">
                      v{d.version} ·{" "}
                      {d.size_kb === undefined
                        ? "lien"
                        : d.size_kb >= 1024
                          ? `${(d.size_kb / 1024).toFixed(1)} Mo`
                          : `${d.size_kb} Ko`}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      deliverableStatus.mutate({
                        id: d.id,
                        status: d.status === "valide" ? "en_attente" : "valide",
                      })
                    }
                    aria-label={`Valider ${d.name}`}
                    className={cn(
                      "text-muted-foreground hover:text-success",
                      d.status === "valide" && "text-success",
                    )}
                  >
                    <CheckCircle2 className="h-4 w-4" />
                  </button>
                  <a
                    href={d.url}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`Voir ${d.name}`}
                    className="text-muted-foreground hover:text-primary"
                  >
                    <Eye className="h-4 w-4" />
                  </a>
                  {canManage && (
                    <button
                      type="button"
                      onClick={() => removeDeliverable.mutate(d.id)}
                      disabled={removeDeliverable.isPending}
                      aria-label={`Supprimer ${d.name}`}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </li>
              );
            })}
            {(deliverables ?? []).length === 0 && (
              <li className="text-xs text-muted-foreground">Aucun livrable déposé.</li>
            )}
          </ul>
        </div>
      </div>

      {/* Discussion */}
      <div className="surface-card mt-4 p-5">
        <h2 className="text-sm font-semibold">Discussion</h2>
        <ul className="mt-4 space-y-4">
          {(comments ?? []).map((c) => (
            <li key={c.id} className={cn("flex gap-3", c.parent_id && "ml-10")}>
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-bold text-primary">
                {authorName(c.author_id)
                  .split(" ")
                  .map((n) => n[0])
                  .join("")}
              </div>
              <div className="min-w-0 flex-1 rounded-lg border border-border px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold">{authorName(c.author_id)}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {new Date(c.created_at).toLocaleString("fr-FR")}
                  </p>
                </div>
                <p className="mt-1 text-sm">{c.body}</p>
              </div>
            </li>
          ))}
          {(comments ?? []).length === 0 && (
            <li className="text-xs text-muted-foreground">Aucun commentaire pour le moment.</li>
          )}
        </ul>

        <div className="mt-4">
          <div className="flex items-end gap-2">
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={1000}
              placeholder={`Écrire un commentaire en tant que ${user?.first_name}... (@mention possible)`}
              className="min-h-20"
            />
            <Button
              size="icon"
              aria-label="Envoyer"
              disabled={!draft.trim() || commentMutation.isPending}
              onClick={() => commentMutation.mutate(draft.trim())}
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function Section({ title, body }: { title: string; body?: string | undefined }) {
  return (
    <div className="mt-5">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      <p className="mt-1.5 text-sm">{body ?? "—"}</p>
    </div>
  );
}

function StepButton({
  label,
  active,
  filled,
  disabled,
  onClick,
  tone = "default",
}: {
  label: string;
  active: boolean;
  filled: boolean;
  disabled: boolean;
  onClick: () => void;
  tone?: "default" | "success" | "warning";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || active}
      aria-current={active}
      className={cn(
        "flex-1 rounded-lg px-3 py-2 text-center text-[11px] font-semibold transition-colors",
        filled
          ? tone === "success"
            ? "bg-success text-success-foreground"
            : tone === "warning"
              ? "bg-warning text-warning-foreground"
              : "bg-primary text-primary-foreground"
          : "bg-muted text-muted-foreground hover:bg-accent",
        active && "ring-2 ring-ring",
      )}
    >
      {label}
    </button>
  );
}
