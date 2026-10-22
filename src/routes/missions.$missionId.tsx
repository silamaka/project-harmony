import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Check, Clock, Eye, LinkIcon, Lock, Pencil, Send, Trash2 } from "lucide-react";
import { Fragment, useEffect, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/app-shell";
import { UserAvatar } from "@/components/shared/avatar";
import {
  ClientMissionStatusBadge,
  MissionStatusBadge,
  PriorityBadge,
  deliverableState,
} from "@/components/shared/badges";
import { ClientMissionDeliverables } from "@/components/shared/client-mission-deliverables";
import { DeliverableCard } from "@/components/shared/deliverable-card";
import {
  ConfirmDeleteButton,
  EditDeliverableDialog,
  EditMissionDialog,
} from "@/components/shared/edit-dialogs";
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
import { WEB_URL_HINT, cn, isWebUrl } from "@/lib/utils";
import { commentService, deliverableService, missionService, userService } from "@/services";
import {
  MISSION_WORKFLOW,
  MISSION_STATUS_LABELS,
  type Deliverable,
  type MissionStatus,
} from "@/types";
import { errorMessage } from "@/lib/api";

export const Route = createFileRoute("/missions/$missionId")({
  // ?livrable=<id> (lien d'une notification) : la fiche s'ouvre sur ce
  // livrable, mis en évidence. Paramètre facultatif.
  validateSearch: (search: Record<string, unknown>): { livrable?: string } =>
    typeof search["livrable"] === "string" ? { livrable: search["livrable"] } : {},
  head: () => ({
    meta: [
      { title: "Détail mission — OLYMPE" },
      { name: "description", content: "Brief, livrables, discussion et workflow de la mission." },
      { property: "og:title", content: "Détail mission — OLYMPE" },
      { property: "og:description", content: "Toute la mission au même endroit." },
    ],
  }),
  component: MissionDetailPage,
});

function MissionDetailPage() {
  const { missionId } = Route.useParams();
  const { livrable: focusedDeliverableId } = Route.useSearch();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [draft, setDraft] = useState("");
  const [draftToClient, setDraftToClient] = useState(false);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [newName, setNewName] = useState("");
  const [newLink, setNewLink] = useState("");
  const [editingDeliverable, setEditingDeliverable] = useState<Deliverable | null>(null);
  const [pendingStatus, setPendingStatus] = useState<MissionStatus | null>(null);

  const { data: mission } = useQuery({
    queryKey: ["missions", missionId],
    queryFn: () => missionService.get(missionId),
  });
  const { data: deliverables } = useQuery({
    queryKey: ["deliverables", missionId],
    queryFn: () => deliverableService.byMission(missionId),
  });

  // Ouverture depuis une notification : on amène le livrable à l'écran et on
  // le met en évidence quelques secondes (sur dix livrables, c'est lui).
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const deliverablesLoaded = deliverables !== undefined;
  useEffect(() => {
    if (!focusedDeliverableId || !deliverablesLoaded) return;
    const el = document.getElementById(`livrable-${focusedDeliverableId}`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlightedId(focusedDeliverableId);
    const timer = window.setTimeout(() => setHighlightedId(null), 4000);
    return () => window.clearTimeout(timer);
  }, [focusedDeliverableId, deliverablesLoaded]);
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
    onError: () => {
      // Quelqu'un d'autre a déjà changé le statut entre-temps (ex. le
      // client vient de décider pendant que l'agence agissait aussi) :
      // le serveur rejette ce changement devenu invalide plutôt que
      // d'écraser silencieusement l'autre décision. On resynchronise
      // avec l'état réel au lieu de laisser l'utilisateur sans réponse.
      refresh([["missions"], ["missions", missionId]]);
      toast.error(
        "Ce changement n'est plus valide : le statut de la mission a été modifié entre-temps. La page a été actualisée.",
      );
    },
  });

  const commentMutation = useMutation({
    mutationFn: (body: string) =>
      commentService.create({
        mission_id: missionId,
        body,
        // Interne par défaut pour l'équipe ; le serveur force "visible"
        // pour un commentaire du client.
        client_visible: isClient || draftToClient,
      }),
    onSuccess: () => {
      refresh([["comments", missionId]]);
      setDraft("");
      setDraftToClient(false);
      toast.success("Commentaire publié.");
    },
  });

  const editCommentMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: string }) => commentService.update(id, body),
    onSuccess: () => {
      refresh([["comments", missionId]]);
      setEditingCommentId(null);
      toast.success("Commentaire modifié.");
    },
    onError: (error) => toast.error(errorMessage(error, "Modification impossible.")),
  });

  const deleteCommentMutation = useMutation({
    mutationFn: (id: string) => commentService.remove(id),
    onSuccess: () => {
      refresh([["comments", missionId]]);
      toast.success("Commentaire supprimé.");
    },
    onError: (error) => toast.error(errorMessage(error, "Suppression impossible.")),
  });

  // Version (v1) et type (déduit du lien) sont posés par le serveur. Un
  // dépôt peut faire bouger la mission (ex. Validé → Validation interne).
  const deliverableMutation = useMutation({
    mutationFn: (payload: { name: string; url: string }) =>
      deliverableService.create({ mission_id: missionId, ...payload }),
    onSuccess: (_d, { url }) => {
      refresh([
        ["deliverables", missionId],
        ["deliverables"],
        ["missions"],
        ["missions", missionId],
      ]);
      setNewName("");
      setNewLink("");
      toast.success(url ? "Livrable ajouté." : "Livrable ajouté — lien à venir.");
    },
    onError: (error) => toast.error(errorMessage(error, "Dépôt impossible.")),
  });

  const navigate = useNavigate();
  const removeMission = useMutation({
    mutationFn: () => missionService.remove(missionId),
    onSuccess: () => {
      toast.success("Mission supprimée.");
      // On invalide "missions" seulement une fois la navigation terminée : sinon la requête
      // ["missions", missionId] encore montée se refetch sur une fiche déjà supprimée et échoue
      // (queryFn qui retourne undefined), ce qui laisse la page dans un état incohérent. La
      // liste "/missions" est réservée admin/chef de projet (AppShell allow) : un collaborateur
      // qui supprime sa propre mission doit repartir sur "/mes-missions", pas sur une page qui
      // lui refuserait l'accès.
      const listPath = user?.role === "collaborateur" ? "/mes-missions" : "/missions";
      void navigate({ to: listPath }).then(() => refresh([["missions"]]));
    },
    onError: (error) => toast.error(errorMessage(error, "Suppression impossible.")),
  });

  const authorName = (id: string) => {
    const u = users?.find((x) => x.id === id);
    return u ? `${u.first_name} ${u.last_name}` : "Utilisateur";
  };

  const currentIndex = mission ? MISSION_WORKFLOW.indexOf(mission.status) : -1;
  const isManager = user?.role === "admin" || user?.role === "chef_projet";
  const isInvolved =
    !!mission &&
    !!user &&
    (mission.assignee_id === user.id || mission.collaborators.includes(user.id));
  /** Modifier/supprimer la mission : l'admin et le chef de projet sur
   * toute mission, un collaborateur uniquement sur les siennes (voir
   * MissionPermission côté serveur, qui reste la source de vérité). Les
   * livrables restent une permission distincte (admin/chef de projet
   * uniquement, voir DeliverablePermission) : ne pas réutiliser cette
   * variable pour eux. */
  const canEditMission = isManager || (user?.role === "collaborateur" && isInvolved);
  /** Le client décide sur chaque livrable (Validé / Corrections) ; le statut
   * de la mission en découle côté serveur, il n'y touche jamais. */
  const isClient = user?.role === "client";
  const newLinkInvalid = newLink.trim() !== "" && !isWebUrl(newLink);
  const submitDeliverable = () => {
    if (!newName.trim() || newLinkInvalid || deliverableMutation.isPending) return;
    deliverableMutation.mutate({ name: newName.trim(), url: newLink.trim() });
  };

  const requestStatusChange = (status: MissionStatus) => {
    if (!mission || status === mission.status) return;
    const distance = Math.abs(MISSION_WORKFLOW.indexOf(status) - currentIndex);
    if (distance > 1) setPendingStatus(status);
    else statusMutation.mutate(status);
  };

  /** Livrables que l'agence a envoyés et qui attendent la décision du client. */
  const awaitingClient = isClient
    ? (deliverables ?? []).filter(
        (d) => d.uploaded_by !== user?.id && deliverableState(d) === "envoye",
      )
    : [];

  return (
    <AppShell
      title={mission?.title ?? "Mission"}
      actions={
        mission && canEditMission ? (
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
          {awaitingClient.length > 0 ? (
            <div className="surface-card mt-4 border-2 border-primary/30 bg-primary/5 p-6">
              <p className="text-xs font-bold tracking-wide text-primary uppercase">
                À vous de jouer — {awaitingClient.length} livrable
                {awaitingClient.length > 1 ? "s" : ""} à valider
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Ouvrez chaque livrable ci-dessous, puis validez-le ou demandez des corrections. La
                mission sera validée automatiquement une fois tous ses livrables validés.
              </p>
            </div>
          ) : (
            <div className="surface-card mt-4 flex items-center gap-3 p-4">
              <Clock className="h-4 w-4 shrink-0 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                {mission?.status === "valide" ||
                mission?.status === "publie" ||
                mission?.status === "termine"
                  ? "Vous avez validé les livrables de cette mission."
                  : mission?.status === "corrections"
                    ? "Vous avez demandé des corrections — l'agence y travaille."
                    : "En cours de traitement par l'agence. Vous serez notifié dès qu'un livrable sera prêt à valider."}
              </p>
            </div>
          )}
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

      {/* Client : ses livrables d'abord, en pleine largeur (c'est ce qu'il
          vient faire ici) ; les infos de la mission passent en dessous.
          Agence : infos à gauche, dépôt et pilotage des livrables à droite. */}
      {isClient && (
        <ClientMissionDeliverables
          deliverables={deliverables ?? []}
          userId={user?.id}
          highlightedId={highlightedId}
        />
      )}

      <div className={cn("mt-4 grid gap-4", !isClient && "lg:grid-cols-3")}>
        {/* min-w-0 : une colonne de grille prend sinon la largeur de son plus
            long mot (ex. une description faite d'URL collées) et casse la page. */}
        <div className={cn("surface-card min-w-0 p-5", !isClient && "lg:col-span-2")}>
          <div className="flex flex-wrap items-center gap-2">
            {/* Priorité interne de l'agence : jamais montrée au client. */}
            {mission && !isClient && <PriorityBadge priority={mission.priority} />}
            {mission &&
              (isClient ? (
                <ClientMissionStatusBadge status={mission.status} />
              ) : (
                <MissionStatusBadge status={mission.status} />
              ))}
            <span className="text-xs text-muted-foreground">
              {mission && new Date(mission.start_date).toLocaleDateString("fr-FR")} →{" "}
              {mission && new Date(mission.deadline).toLocaleDateString("fr-FR")}
            </span>
          </div>
          {mission && (
            <div className="mt-5">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Équipe
              </h3>
              <ul className="mt-2 flex flex-wrap gap-2">
                {[mission.assignee_id, ...mission.collaborators].map((id, i) => {
                  const member = users?.find((u) => u.id === id);
                  return (
                    <li
                      key={id}
                      className="flex items-center gap-2 rounded-full border border-border py-1 pr-3 pl-1"
                    >
                      {member ? (
                        <UserAvatar user={member} className="h-6 w-6 text-[10px]" />
                      ) : (
                        <div className="h-6 w-6 rounded-full bg-muted" />
                      )}
                      <span className="text-sm">{authorName(id)}</span>
                      <span
                        className={cn(
                          "rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                          i === 0 ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground",
                        )}
                      >
                        {i === 0 ? "Responsable" : "Collaborateur"}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          <Section title="Description" body={mission?.description} />
          {mission && mission.sources.length > 0 && (
            <div className="mt-5">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Sources
              </h3>
              <ul className="mt-1.5 space-y-1">
                {mission.sources.map((s, i) => (
                  <li key={`${s.url}-${i}`} className="flex items-center gap-1.5 text-sm">
                    <LinkIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noreferrer"
                      className="truncate text-primary hover:underline"
                    >
                      {s.label || s.url}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {!isClient && (
          <div className="surface-card min-w-0 p-5">
            <h2 className="text-sm font-semibold">Livrables</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Donne un nom clair au livrable, colle son lien (Drive, Figma, S3...), puis clique sur
              Déposer. Lien pas encore prêt ? Dépose-le sans lien : il apparaîtra « Lien à venir »
              et tu pourras l'ajouter plus tard.
            </p>

            <div className="mt-3 space-y-2">
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") submitDeliverable();
                }}
                placeholder="Nom du livrable (ex. Maquette homepage)"
                maxLength={140}
                className="h-9"
              />
              <div className="flex items-center gap-2">
                <Input
                  value={newLink}
                  onChange={(e) => setNewLink(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") submitDeliverable();
                  }}
                  placeholder="https://… (facultatif)"
                  aria-invalid={newLinkInvalid}
                  className={cn("h-9", newLinkInvalid && "border-destructive")}
                />
                <Button
                  size="sm"
                  variant={newName.trim() ? "default" : "outline"}
                  disabled={!newName.trim() || newLinkInvalid || deliverableMutation.isPending}
                  onClick={submitDeliverable}
                  className="shrink-0"
                >
                  Déposer
                </Button>
              </div>
              {newLinkInvalid && <p className="text-xs text-destructive">{WEB_URL_HINT}</p>}
            </div>
            <div className="mt-4 space-y-2">
              {(deliverables ?? []).map((d) => (
                <DeliverableCard
                  key={d.id}
                  id={`livrable-${d.id}`}
                  deliverable={d}
                  onEdit={setEditingDeliverable}
                  highlighted={highlightedId === d.id}
                />
              ))}
              {(deliverables ?? []).length === 0 && (
                <p className="text-xs text-muted-foreground">Aucun livrable déposé.</p>
              )}
            </div>
          </div>
        )}
      </div>

      <EditDeliverableDialog
        deliverable={editingDeliverable}
        onOpenChange={(o) => !o && setEditingDeliverable(null)}
      />

      {/* Discussion */}
      <div className="surface-card mt-4 p-5">
        <h2 className="text-sm font-semibold">Discussion</h2>
        <ul className="mt-4 space-y-4">
          {(comments ?? []).map((c) => {
            const isAuthor = user?.id === c.author_id;
            const isEditing = editingCommentId === c.id;
            return (
              <li key={c.id} className={cn("flex gap-3", c.parent_id && "ml-10")}>
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-bold text-primary">
                  {authorName(c.author_id)
                    .split(" ")
                    .map((n) => n[0])
                    .join("")}
                </div>
                <div
                  className={cn(
                    "min-w-0 flex-1 rounded-lg border px-3 py-2",
                    // Côté agence, un commentaire interne se distingue d'un
                    // message lu par le client.
                    !isClient && !c.client_visible
                      ? "border-dashed border-border bg-muted/30"
                      : "border-border",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="flex items-center gap-2 text-xs font-semibold">
                      {authorName(c.author_id)}
                      {!isClient &&
                        (c.client_visible ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                            <Eye className="h-3 w-3" /> Visible par le client
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                            <Lock className="h-3 w-3" /> Interne
                          </span>
                        ))}
                    </p>
                    <div className="flex items-center gap-2">
                      <p className="text-[11px] text-muted-foreground">
                        {new Date(c.created_at).toLocaleString("fr-FR")}
                      </p>
                      {!isEditing && isAuthor && (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            aria-label="Modifier"
                            onClick={() => {
                              setEditingCommentId(c.id);
                              setEditDraft(c.body);
                            }}
                            className="text-muted-foreground hover:text-foreground"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            aria-label="Supprimer"
                            onClick={() => deleteCommentMutation.mutate(c.id)}
                            className="text-muted-foreground hover:text-destructive"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                  {isEditing ? (
                    <div className="mt-1.5 space-y-1.5">
                      <Textarea
                        value={editDraft}
                        onChange={(e) => setEditDraft(e.target.value)}
                        maxLength={1000}
                        className="min-h-16 text-sm"
                      />
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          disabled={!editDraft.trim() || editCommentMutation.isPending}
                          onClick={() =>
                            editCommentMutation.mutate({ id: c.id, body: editDraft.trim() })
                          }
                        >
                          Enregistrer
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setEditingCommentId(null)}
                        >
                          Annuler
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <p className="mt-1 whitespace-pre-wrap break-words text-sm">{c.body}</p>
                  )}
                </div>
              </li>
            );
          })}
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
              placeholder={
                isClient
                  ? "Écrire un message à l'équipe…"
                  : draftToClient
                    ? `Message au client, en tant que ${user?.first_name}…`
                    : `Note interne à l'équipe, en tant que ${user?.first_name}… (@mention possible)`
              }
              className={cn("min-h-20", !isClient && draftToClient && "border-primary/50")}
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
          {!isClient && (
            <label className="mt-2 inline-flex cursor-pointer items-center gap-2 text-xs select-none">
              <input
                type="checkbox"
                checked={draftToClient}
                onChange={(e) => setDraftToClient(e.target.checked)}
                className="h-3.5 w-3.5 accent-[var(--color-primary)]"
              />
              {draftToClient ? (
                <span className="font-medium text-primary">
                  Visible par le client : il lira ce message.
                </span>
              ) : (
                <span className="text-muted-foreground">
                  Interne : seule l'équipe le voit. Cochez pour l'envoyer au client.
                </span>
              )}
            </label>
          )}
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
      <p className="mt-1.5 whitespace-pre-wrap text-sm [overflow-wrap:anywhere]">{body ?? "—"}</p>
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
