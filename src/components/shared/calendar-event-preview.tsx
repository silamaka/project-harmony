import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { differenceInCalendarDays, parseISO } from "date-fns";
import { ArrowRight } from "lucide-react";
import { useState } from "react";
import {
  CLIENT_DELIVERABLE_STATE_LABELS,
  ClientMissionStatusBadge,
  DELIVERABLE_STATES,
  DELIVERABLE_STATE_LABELS,
  DeliverableStateBadge,
  MissionStatusBadge,
  PriorityBadge,
  deliverableState,
} from "@/components/shared/badges";
import { DeliverableFeedback } from "@/components/shared/deliverable-feedback";
import { ScheduledLine } from "@/components/shared/deliverable-schedule";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/auth-context";
import { cn } from "@/lib/utils";
import {
  clientService,
  deliverableService,
  missionService,
  projectService,
  userService,
} from "@/services";
import type { CalendarEvent, Deliverable, Mission } from "@/types";

/**
 * Aperçu d'un événement du calendrier, sans quitter la page : une échéance
 * de mission (client, projet, statut, équipe, brief, livrables) ou un
 * livrable / une publication (état, dates, demande de corrections). Réutilise
 * les données déjà chargées par l'appli (mêmes clés de cache) ; la portée
 * vient du serveur (un client ne reçoit que ce qui le concerne), et la
 * priorité, interne, ne lui est pas montrée. Rien pour une réunion.
 */
export function CalendarEventPreview({
  event,
  onClose,
}: {
  event: CalendarEvent;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const isClient = user?.role === "client";
  const { data: missions } = useQuery({ queryKey: ["missions"], queryFn: missionService.list });
  const { data: deliverables } = useQuery({
    queryKey: ["deliverables"],
    queryFn: deliverableService.list,
  });
  const { data: clients } = useQuery({ queryKey: ["clients"], queryFn: clientService.list });
  const { data: projects } = useQuery({ queryKey: ["projects"], queryFn: projectService.list });
  const { data: users } = useQuery({ queryKey: ["users"], queryFn: userService.list });

  if (!event.mission_id) return null;

  // Livrable déposé ("liv-<id>") ou publication prévue ("pub-<id>").
  const deliverableId =
    event.deliverable_id ?? (event.id.startsWith("liv-") ? event.id.slice(4) : undefined);
  const deliverable = deliverableId ? deliverables?.find((d) => d.id === deliverableId) : undefined;
  const mission = missions?.find((m) => m.id === event.mission_id);
  const clientName = clients?.find((c) => c.id === mission?.client_id)?.name;
  const projectName = projects?.find((p) => p.id === mission?.project_id)?.name;
  const nameOf = (id: string) => {
    const u = users?.find((x) => x.id === id);
    return u ? `${u.first_name} ${u.last_name}` : "—";
  };

  return (
    <div className="space-y-3 border-t border-border pt-3">
      {deliverableId ? (
        deliverable ? (
          <DeliverablePreview
            deliverable={deliverable}
            mission={mission}
            clientName={clientName}
            isClient={isClient}
          />
        ) : (
          <p className="text-xs text-muted-foreground">Chargement du livrable…</p>
        )
      ) : mission ? (
        <MissionPreview
          mission={mission}
          deliverables={(deliverables ?? []).filter((d) => d.mission_id === mission.id)}
          clientName={clientName}
          projectName={projectName}
          nameOf={nameOf}
          isClient={isClient}
        />
      ) : (
        <p className="text-xs text-muted-foreground">Chargement de la mission…</p>
      )}

      <Button asChild size="sm" className="w-full sm:w-auto">
        <Link
          to="/missions/$missionId"
          params={{ missionId: event.mission_id }}
          search={deliverableId ? { livrable: deliverableId } : {}}
          onClick={onClose}
        >
          {deliverableId ? "Ouvrir le livrable" : "Ouvrir la mission"}
          <ArrowRight className="ml-1 h-4 w-4" />
        </Link>
      </Button>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[6.5rem_1fr] gap-2 text-sm">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <div className="min-w-0 [overflow-wrap:anywhere]">{children}</div>
    </div>
  );
}

function deadlineHint(deadline: string) {
  const days = differenceInCalendarDays(parseISO(deadline), new Date());
  if (days === 0) return "aujourd'hui";
  if (days === 1) return "demain";
  if (days > 1) return `dans ${days} jours`;
  return `il y a ${-days} jour${days === -1 ? "" : "s"}`;
}

function MissionPreview({
  mission,
  deliverables,
  clientName,
  projectName,
  nameOf,
  isClient,
}: {
  mission: Mission;
  deliverables: Deliverable[];
  clientName: string | undefined;
  projectName: string | undefined;
  nameOf: (id: string) => string;
  isClient: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const labels = isClient ? CLIENT_DELIVERABLE_STATE_LABELS : DELIVERABLE_STATE_LABELS;
  const counts = DELIVERABLE_STATES.map((state) => ({
    state,
    n: deliverables.filter((d) => deliverableState(d) === state).length,
  })).filter((c) => c.n > 0);
  const description = mission.description?.trim();

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {isClient ? (
          <ClientMissionStatusBadge status={mission.status} />
        ) : (
          <MissionStatusBadge status={mission.status} />
        )}
        {!isClient && <PriorityBadge priority={mission.priority} />}
        <span className="text-xs text-muted-foreground">
          Échéance {new Date(mission.deadline).toLocaleDateString("fr-FR")} (
          {deadlineHint(mission.deadline)})
        </span>
      </div>
      {(clientName || projectName) && (
        <Row label="Client">
          {clientName ?? "—"}
          {projectName && <span className="text-muted-foreground"> · {projectName}</span>}
        </Row>
      )}
      <Row label="Équipe">
        {nameOf(mission.assignee_id)}
        <span className="text-muted-foreground"> (responsable)</span>
        {mission.collaborators.length > 0 &&
          `, ${mission.collaborators.map((id) => nameOf(id)).join(", ")}`}
      </Row>
      {description && (
        <Row label="Description">
          <p className={cn("whitespace-pre-wrap", !expanded && "line-clamp-2")}>{description}</p>
          {description.length > 120 && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="text-xs font-medium text-primary hover:underline"
            >
              {expanded ? "Voir moins" : "Voir plus"}
            </button>
          )}
        </Row>
      )}
      <Row label={`Livrables (${deliverables.length})`}>
        {counts.length === 0 ? (
          <span className="text-muted-foreground">Aucun pour le moment.</span>
        ) : (
          counts.map((c) => `${c.n} ${labels[c.state].toLowerCase()}`).join(" · ")
        )}
      </Row>
    </div>
  );
}

function DeliverablePreview({
  deliverable: d,
  mission,
  clientName,
  isClient,
}: {
  deliverable: Deliverable;
  mission: Mission | undefined;
  clientName: string | undefined;
  isClient: boolean;
}) {
  const audience = isClient ? "client" : "agence";
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {/* Le nom est déjà le titre de la fenêtre. */}
        <span className="text-xs text-muted-foreground">Version v{d.version}</span>
        <DeliverableStateBadge deliverable={d} audience={audience} showPublishedDate={false} />
      </div>
      <ScheduledLine deliverable={d} />
      {d.published_at && (
        <p className="text-xs text-muted-foreground">
          Publiée le {new Date(d.published_at).toLocaleDateString("fr-FR")} à{" "}
          {new Date(d.published_at).toLocaleTimeString("fr-FR", {
            hour: "2-digit",
            minute: "2-digit",
          })}
          {d.scheduled_at &&
            ` · prévue le ${new Date(d.scheduled_at).toLocaleDateString("fr-FR")} à ${new Date(
              d.scheduled_at,
            ).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`}
        </p>
      )}
      {mission && (
        <Row label="Mission">
          {mission.title}
          {clientName && <span className="text-muted-foreground"> · {clientName}</span>}
        </Row>
      )}
      <DeliverableFeedback deliverable={d} audience={audience} />
    </div>
  );
}
