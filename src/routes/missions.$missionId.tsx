import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  Check,
  CheckCircle2,
  Clock,
  Eye,
  FileText,
  Film,
  ImageIcon,
  LinkIcon,
  RefreshCcw,
  Send,
  Trash2,
  Upload,
  FileArchive,
} from "lucide-react";
import { Fragment, useState } from "react";
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
  /** Le client ne pilote que sa décision (Validé / Corrections), pas le pipeline interne. */
  const isClient = user?.role === "client";

  const requestStatusChange = (status: MissionStatus) => {
    if (!mission || status === mission.status) return;
    const distance = Math.abs(MISSION_WORKFLOW.indexOf(status) - currentIndex);
    if (distance > 1) setPendingStatus(status);
    else statusMutation.mutate(status);
  };

  /** Le client ne peut valider / demander des corrections qu'une fois la
   * mission effectivement envoyée par l'agence — pas avant. */
  const clientTurnToAct = isClient && mission?.status === "envoye_client";

  return (
    <AppShell
      title={mission?.title ?? "Mission"}
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
      {isClient ? (
        <>
          {clientTurnToAct ? (
            <div className="surface-card mt-4 border-2 border-primary/30 bg-primary/5 p-6">
              <p className="text-xs font-bold tracking-wide text-primary uppercase">
                À vous de jouer
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                L'agence a terminé son travail sur cette mission. Validez-la, ou demandez des
                corrections si quelque chose ne convient pas.
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                <Button
                  size="lg"
                  className="h-14 flex-1 min-w-[200px] bg-success text-base text-success-foreground shadow-md hover:bg-success/90"
                  disabled={statusMutation.isPending}
                  onClick={() => requestStatusChange("valide")}
                >
                  <Check className="mr-2 h-5 w-5" /> Valider
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  className="h-14 flex-1 min-w-[200px] border-2 border-warning text-base text-warning shadow-md hover:bg-warning/10"
                  disabled={statusMutation.isPending}
                  onClick={() => requestStatusChange("corrections")}
                >
                  <RefreshCcw className="mr-2 h-5 w-5" /> Demander des corrections
                </Button>
              </div>
            </div>
          ) : (
            <div className="surface-card mt-4 flex items-center gap-3 p-4">
              <Clock className="h-4 w-4 shrink-0 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                {mission?.status === "valide" ||
                mission?.status === "publie" ||
                mission?.status === "termine"
                  ? "Vous avez validé cette mission."
                  : mission?.status === "corrections"
                    ? "Vous avez demandé des corrections — l'agence y travaille."
                    : "En cours de traitement par l'agence. Vous serez notifié dès qu'elle sera prête à valider."}
              </p>
            </div>
          )}

          <details className="surface-card mt-3 p-4">
            <summary className="cursor-pointer text-xs font-medium text-muted-foreground select-none">
              Suivi interne de l'agence
            </summary>
            <div className="mt-3 overflow-x-auto opacity-60">
              <div className="flex min-w-[860px] items-center gap-1">
                {MISSION_WORKFLOW.slice(0, 5).map((s, i) => (
                  <Fragment key={s}>
                    <StepButton
                      label={MISSION_STATUS_LABELS[s]}
                      active={mission?.status === s}
                      filled={i <= currentIndex}
                      done={i < currentIndex}
                      disabled
                      onClick={() => {}}
                    />
                    <StepConnector filled={i < currentIndex} />
                  </Fragment>
                ))}
                <StepConnector filled={currentIndex >= MISSION_WORKFLOW.indexOf("publie")} />
                <StepButton
                  label="Publié"
                  active={mission?.status === "publie"}
                  filled={mission?.status === "publie" || mission?.status === "termine"}
                  done={mission?.status === "termine"}
                  disabled
                  onClick={() => {}}
                />
                <StepConnector filled={mission?.status === "termine"} />
                <StepButton
                  label="Terminé"
                  active={mission?.status === "termine"}
                  filled={mission?.status === "termine"}
                  done={false}
                  disabled
                  onClick={() => {}}
                />
              </div>
            </div>
          </details>
        </>
      ) : (
        <div className="surface-card mt-4 overflow-x-auto p-4">
          <div className="flex min-w-[860px] items-center gap-1">
            {MISSION_WORKFLOW.slice(0, 5).map((s, i) => (
              <Fragment key={s}>
                <StepButton
                  label={MISSION_STATUS_LABELS[s]}
                  active={mission?.status === s}
                  filled={i <= currentIndex}
                  done={i < currentIndex}
                  disabled={statusMutation.isPending}
                  onClick={() => requestStatusChange(s)}
                />
                <StepConnector filled={i < currentIndex} />
              </Fragment>
            ))}

            <div className="flex shrink-0 items-center gap-1 rounded-lg border border-dashed border-border p-1">
              <StepButton
                label="Validé"
                active={mission?.status === "valide"}
                filled={
                  mission?.status === "valide" ||
                  mission?.status === "publie" ||
                  mission?.status === "termine"
                }
                done={mission?.status === "publie" || mission?.status === "termine"}
                disabled={statusMutation.isPending}
                onClick={() => requestStatusChange("valide")}
                tone="success"
                className="flex-none px-3"
              />
              <span className="text-[10px] font-medium text-muted-foreground">ou</span>
              <StepButton
                label="Corrections"
                active={mission?.status === "corrections"}
                filled={mission?.status === "corrections"}
                done={false}
                disabled={statusMutation.isPending}
                onClick={() => requestStatusChange("corrections")}
                tone="warning"
                className="flex-none px-3"
              />
            </div>

            <StepConnector filled={currentIndex >= MISSION_WORKFLOW.indexOf("publie")} />

            <StepButton
              label="Publié"
              active={mission?.status === "publie"}
              filled={mission?.status === "publie" || mission?.status === "termine"}
              done={mission?.status === "termine"}
              disabled={statusMutation.isPending}
              onClick={() => requestStatusChange("publie")}
            />

            <StepConnector filled={mission?.status === "termine"} />

            <StepButton
              label="Terminé"
              active={mission?.status === "termine"}
              filled={mission?.status === "termine"}
              done={false}
              disabled={statusMutation.isPending}
              onClick={() => requestStatusChange("termine")}
            />
          </div>
        </div>
      )}

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
                <p className="mt-1 whitespace-pre-wrap break-words text-sm">{c.body}</p>
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
      <p className="mt-1.5 whitespace-pre-wrap break-words text-sm">{body ?? "—"}</p>
    </div>
  );
}

function StepButton({
  label,
  active,
  filled,
  done,
  disabled,
  onClick,
  tone = "default",
  className,
}: {
  label: string;
  active: boolean;
  filled: boolean;
  /** Étape déjà dépassée (par opposition à l'étape courante). */
  done: boolean;
  disabled: boolean;
  onClick: () => void;
  tone?: "default" | "success" | "warning";
  className?: string;
}) {
  const toneSolid =
    tone === "success"
      ? "bg-success text-success-foreground shadow-sm"
      : tone === "warning"
        ? "bg-warning text-warning-foreground shadow-sm"
        : "bg-primary text-primary-foreground shadow-sm";
  const toneSoft =
    tone === "success"
      ? "bg-success/12 text-success"
      : tone === "warning"
        ? "bg-warning/15 text-warning"
        : "bg-primary/12 text-primary";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || active}
      aria-current={active}
      className={cn(
        "flex-1 rounded-lg px-3 py-2 text-center text-[11px] font-semibold whitespace-nowrap transition-all",
        active && toneSolid,
        !active && filled && toneSoft,
        !filled && "bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground",
        active && "scale-[1.03] ring-2 ring-ring ring-offset-1 ring-offset-card",
        className,
      )}
    >
      <span className="inline-flex items-center gap-1">
        {done && <Check className="h-3 w-3" />}
        {label}
      </span>
    </button>
  );
}

function StepConnector({ filled }: { filled: boolean }) {
  return (
    <div
      className={cn(
        "h-0.5 w-4 shrink-0 rounded-full transition-colors",
        filled ? "bg-primary" : "bg-border",
      )}
    />
  );
}
