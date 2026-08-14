import { cn } from "@/lib/utils";
import {
  MISSION_STATUS_LABELS,
  PRIORITY_LABELS,
  PROJECT_STATUS_LABELS,
  type MissionStatus,
  type Priority,
  type ProjectStatus,
} from "@/types";

const base =
  "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap";

export const missionTone: Record<MissionStatus, string> = {
  a_faire: "bg-muted text-muted-foreground",
  en_cours: "bg-primary/10 text-primary",
  livrable_depose: "bg-info/15 text-info",
  validation_interne: "bg-warning/20 text-warning",
  envoye_client: "bg-accent text-accent-foreground",
  valide: "bg-success/15 text-success",
  corrections: "bg-destructive/12 text-destructive",
  termine: "bg-success/20 text-success",
};

export function MissionStatusBadge({ status }: { status: MissionStatus }) {
  return <span className={cn(base, missionTone[status])}>{MISSION_STATUS_LABELS[status]}</span>;
}

export const projectTone: Record<ProjectStatus, string> = {
  brouillon: "bg-muted text-muted-foreground",
  en_preparation: "bg-info/15 text-info",
  en_cours: "bg-primary/10 text-primary",
  en_attente: "bg-warning/20 text-warning",
  termine: "bg-success/15 text-success",
  archive: "bg-muted text-muted-foreground",
};

export function ProjectStatusBadge({ status }: { status: ProjectStatus }) {
  return <span className={cn(base, projectTone[status])}>{PROJECT_STATUS_LABELS[status]}</span>;
}

export const priorityTone: Record<Priority, string> = {
  faible: "bg-muted text-muted-foreground",
  normale: "bg-info/15 text-info",
  haute: "bg-warning/20 text-warning",
  urgente: "bg-destructive text-destructive-foreground",
};

export function PriorityBadge({ priority }: { priority: Priority }) {
  return <span className={cn(base, priorityTone[priority])}>{PRIORITY_LABELS[priority]}</span>;
}
