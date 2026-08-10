import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  CheckCircle2,
  Download,
  FileText,
  Film,
  ImageIcon,
  LinkIcon,
  Paperclip,
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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/context/auth-context";
import { cn } from "@/lib/utils";
import {
  commentService,
  deliverableService,
  missionService,
  userService,
} from "@/services";
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
      commentService.create({ mission_id: missionId, author_id: user?.id ?? "", body }),
    onSuccess: () => {
      refresh([["comments", missionId]]);
      setDraft("");
      toast.success("Commentaire publié.");
    },
  });

  const deliverableMutation = useMutation({
    mutationFn: (url: string) =>
      deliverableService.create({
        mission_id: missionId,
        name: url.split("/").filter(Boolean).pop() ?? "Livrable",
        type: "lien",
        url,
        version: ((deliverables ?? []).length || 0) + 1,
        uploaded_by: user?.id ?? "",
        status: "en_attente",
      }),
    onSuccess: () => {
      refresh([["deliverables", missionId], ["deliverables"]]);
      setNewLink("");
      toast.success("Livrable ajouté.");
    },
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
      refresh([["missions"]]);
      toast.success("Mission supprimée.");
      void navigate({ to: "/missions" });
    },
    onError: () => toast.error("Suppression impossible."),
  });

  const authorName = (id: string) => {
    const u = users?.find((x) => x.id === id);
    return u ? `${u.first_name} ${u.last_name}` : "Utilisateur";
  };

  const currentIndex = mission ? MISSION_WORKFLOW.indexOf(mission.status) : -1;
  const canManage = user?.role === "admin" || user?.role === "chef_projet";

  return (
    <AppShell
      title={mission?.title ?? "Mission"}
      subtitle={mission?.objective}
      actions={
        mission && canManage ? (
          <div className="flex items-center gap-2">
            <EditMissionDialog mission={mission} />
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
      <Link
        to="/missions"
        className="inline-flex items-center gap-2 text-xs font-medium text-primary hover:underline"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Retour aux missions
      </Link>

      {/* Workflow */}
      <div className="surface-card mt-4 overflow-x-auto p-4">
        <div className="flex min-w-[760px] items-center gap-2">
          {MISSION_WORKFLOW.map((s, i) => (
            <div key={s} className="flex flex-1 items-center gap-2">
              <button
                type="button"
                onClick={() => statusMutation.mutate(s)}
                disabled={statusMutation.isPending || mission?.status === s}
                aria-current={mission?.status === s}
                className={cn(
                  "flex-1 rounded-lg px-3 py-2 text-center text-[11px] font-semibold transition-colors",
                  i <= currentIndex
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-accent",
                  mission?.status === s && "ring-2 ring-ring",
                )}
              >
                {MISSION_STATUS_LABELS[s]}
              </button>
            </div>
          ))}
        </div>
      </div>

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
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Livrables</h2>
            <Button
              size="sm"
              variant="outline"
              disabled={!newLink.trim() || deliverableMutation.isPending}
              onClick={() => deliverableMutation.mutate(newLink.trim())}
            >
              <Upload className="mr-1 h-3.5 w-3.5" /> Déposer
            </Button>
          </div>
          <Input
            value={newLink}
            onChange={(e) => setNewLink(e.target.value)}
            placeholder="Lien du livrable (Drive, Figma, S3...)"
            className="mt-3 h-9"
          />
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
                      v{d.version} · {d.size_kb ? `${Math.round(d.size_kb / 1024)} Mo` : "lien"}
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
                    aria-label={`Ouvrir ${d.name}`}
                    className="text-muted-foreground hover:text-primary"
                  >
                    <Download className="h-4 w-4" />
                  </a>
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

        <div className="mt-4 flex items-end gap-2">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={1000}
            placeholder={`Écrire un commentaire en tant que ${user?.first_name}... (@mention possible)`}
            className="min-h-20"
          />
          <div className="flex flex-col gap-2">
            <Button
              variant="outline"
              size="icon"
              aria-label="Joindre un fichier"
              onClick={() => setDraft((d) => `${d}${d ? " " : ""}[pièce jointe] `)}
            >
              <Paperclip className="h-4 w-4" />
            </Button>
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
