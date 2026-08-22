import { Link } from "@tanstack/react-router";
import { MoreVertical, Pencil, Trash2 } from "lucide-react";
import { missionTone, priorityTone } from "@/components/shared/badges";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ExpandableText } from "@/components/shared/expandable-text";
import { PillSelect } from "@/components/shared/pill-select";
import { cn } from "@/lib/utils";
import { isLate } from "@/services";
import {
  MISSION_STATUS_LABELS,
  PRIORITY_LABELS,
  PRIORITY_ORDER,
  type Mission,
  type MissionStatus,
  type Priority,
} from "@/types";

type DeliverableRef = { id: string; name: string; url: string; version?: number };

/** Largeurs de colonnes (%) selon les colonnes optionnelles affichées ; chaque set totalise 100%. */
const COLUMN_WIDTHS = {
  withClientAndResponsable: [7, 17, 12, 10, 10, 8, 14, 10, 12],
  withClientAndResponsableActions: [7, 13, 11, 10, 10, 8, 14, 10, 12, 5],
  responsableOnly: [9, 19, 13, 12, 8, 16, 10, 13],
  responsableOnlyActions: [9, 15, 12, 12, 8, 16, 10, 13, 5],
  clientOnly: [8, 20, 14, 12, 9, 16, 11, 10],
  clientOnlyActions: [8, 16, 13, 12, 9, 16, 11, 10, 5],
} as const;

/**
 * Tableau spreadsheet réutilisable des missions (priorité, titre, description,
 * client/responsable optionnels, deadline, statut, livrable, commentaires).
 * Priorité et statut sont toujours éditables en ligne ; le responsable l'est
 * si `assigneeOptions` + `onAssigneeChange` sont fournis. Un menu "⋮" discret
 * (Modifier / Supprimer) apparaît en fin de ligne si `onEditMission` ou
 * `onDeleteMission` sont fournis, sans ajouter de colonne de boutons visibles en permanence.
 */
export function MissionsTable({
  missions,
  showClient = false,
  clientName,
  showResponsable = false,
  assigneeOptions,
  assigneeTone,
  deliverablesFor,
  commentFor,
  onStatusChange,
  onPriorityChange,
  onAssigneeChange,
  onEditMission,
  onDeleteMission,
  emptyMessage = "Aucune mission.",
}: {
  missions: Mission[];
  showClient?: boolean;
  clientName?: (id: string) => string;
  showResponsable?: boolean;
  assigneeOptions?: Record<string, string>;
  assigneeTone?: Record<string, string>;
  deliverablesFor: (missionId: string) => DeliverableRef[];
  commentFor: (missionId: string) => string;
  onStatusChange: (missionId: string, status: MissionStatus) => void;
  onPriorityChange: (missionId: string, priority: Priority) => void;
  onAssigneeChange?: (missionId: string, assigneeId: string) => void;
  onEditMission?: (mission: Mission) => void;
  onDeleteMission?: (mission: Mission) => void;
  emptyMessage?: string;
}) {
  const showActions = onEditMission !== undefined || onDeleteMission !== undefined;
  const widths =
    showClient && showResponsable
      ? showActions
        ? COLUMN_WIDTHS.withClientAndResponsableActions
        : COLUMN_WIDTHS.withClientAndResponsable
      : showResponsable
        ? showActions
          ? COLUMN_WIDTHS.responsableOnlyActions
          : COLUMN_WIDTHS.responsableOnly
        : showActions
          ? COLUMN_WIDTHS.clientOnlyActions
          : COLUMN_WIDTHS.clientOnly;
  const columnCount = 6 + (showClient ? 1 : 0) + (showResponsable ? 1 : 0) + (showActions ? 1 : 0);
  const sortedMissions = [...missions].sort((a, b) => {
    const priorityDiff = PRIORITY_ORDER.indexOf(a.priority) - PRIORITY_ORDER.indexOf(b.priority);
    if (priorityDiff !== 0) return priorityDiff;
    // À priorité égale, la deadline la plus proche remonte en premier.
    return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
  });

  return (
    <div className="surface-card overflow-hidden">
      <div className="max-h-[70vh] overflow-auto">
        <table className="w-full min-w-[860px] table-fixed border-collapse text-sm">
          <colgroup>
            {widths.map((w, i) => (
              <col key={i} className={`w-[${w}%]`} style={{ width: `${w}%` }} />
            ))}
          </colgroup>
          <thead>
            <tr className="sticky top-0 z-10 bg-muted text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground shadow-[inset_0_-1px_0_var(--color-border)]">
              <th className="px-3 py-3">Priorité</th>
              <th className="px-3 py-3">Mission</th>
              <th className="px-3 py-3">Description</th>
              {showClient && <th className="px-3 py-3">Client</th>}
              {showResponsable && <th className="px-3 py-3">Responsable</th>}
              <th className="px-3 py-3">Deadline</th>
              <th className="px-3 py-3">État d'avancement</th>
              <th className="px-3 py-3">Livrable</th>
              <th className="px-3 py-3">Commentaires</th>
              {showActions && <th className="px-3 py-3" aria-hidden />}
            </tr>
          </thead>
          <tbody>
            {sortedMissions.map((m) => (
              <MissionRow
                key={m.id}
                mission={m}
                client={showClient ? (clientName?.(m.client_id) ?? "—") : undefined}
                assigneeOptions={showResponsable ? assigneeOptions : undefined}
                assigneeTone={showResponsable ? assigneeTone : undefined}
                deliverables={deliverablesFor(m.id)}
                comment={commentFor(m.id)}
                onStatusChange={(status) => onStatusChange(m.id, status)}
                onPriorityChange={(priority) => onPriorityChange(m.id, priority)}
                onAssigneeChange={
                  onAssigneeChange ? (assigneeId) => onAssigneeChange(m.id, assigneeId) : undefined
                }
                onEdit={onEditMission ? () => onEditMission(m) : undefined}
                onDelete={onDeleteMission ? () => onDeleteMission(m) : undefined}
              />
            ))}
            {missions.length === 0 && (
              <tr>
                <td
                  colSpan={columnCount}
                  className="px-4 py-10 text-center text-sm text-muted-foreground"
                >
                  {emptyMessage}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MissionRow({
  mission,
  client,
  assigneeOptions,
  assigneeTone,
  deliverables,
  comment,
  onStatusChange,
  onPriorityChange,
  onAssigneeChange,
  onEdit,
  onDelete,
}: {
  mission: Mission;
  client?: string | undefined;
  assigneeOptions?: Record<string, string> | undefined;
  assigneeTone?: Record<string, string> | undefined;
  deliverables: DeliverableRef[];
  comment: string;
  onStatusChange: (status: MissionStatus) => void;
  onPriorityChange: (priority: Priority) => void;
  onAssigneeChange?: ((assigneeId: string) => void) | undefined;
  onEdit?: (() => void) | undefined;
  onDelete?: (() => void) | undefined;
}) {
  const late = isLate(mission);
  const showResponsable = assigneeOptions !== undefined && assigneeTone !== undefined;
  const showActions = onEdit !== undefined || onDelete !== undefined;

  return (
    <tr
      className={cn(
        "border-t border-border align-top transition-colors hover:brightness-[0.98]",
        missionTone[mission.status],
      )}
    >
      <td className="overflow-hidden px-3 py-3 pr-4">
        <PillSelect
          value={mission.priority}
          options={PRIORITY_LABELS}
          tone={priorityTone}
          onChange={(v) => onPriorityChange(v as Priority)}
        />
      </td>
      <td className="px-3 py-3">
        <Link
          to="/missions/$missionId"
          params={{ missionId: mission.id }}
          className="line-clamp-2 font-medium break-words hover:text-primary hover:underline"
        >
          {mission.title}
        </Link>
      </td>
      <td className="px-3 py-3 text-xs text-muted-foreground">
        <ExpandableText text={mission.description || "—"} />
      </td>
      {client !== undefined && (
        <td className="truncate px-3 py-3 text-xs text-muted-foreground" title={client}>
          {client}
        </td>
      )}
      {showResponsable && (
        <td className="overflow-hidden px-3 py-3 pr-4">
          <PillSelect
            value={mission.assignee_id}
            options={assigneeOptions}
            tone={assigneeTone}
            onChange={(v) => onAssigneeChange?.(v)}
          />
        </td>
      )}
      <td
        className={cn(
          "px-3 py-3 text-xs whitespace-nowrap",
          late && "font-semibold text-destructive",
        )}
      >
        {new Date(mission.deadline).toLocaleDateString("fr-FR")}
      </td>
      <td className="overflow-hidden px-3 py-3 pr-4">
        <PillSelect
          value={mission.status}
          options={MISSION_STATUS_LABELS}
          tone={missionTone}
          onChange={(v) => onStatusChange(v as MissionStatus)}
        />
      </td>
      <td className="px-3 py-3 text-xs">
        {deliverables[0] === undefined ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <a
            href={deliverables[0].url}
            target="_blank"
            rel="noreferrer"
            title="Ouvrir le lien du livrable"
            className="line-clamp-2 break-words text-primary hover:underline"
          >
            {deliverables[0].name}
            {deliverables.length > 1 && ` +${deliverables.length - 1}`}
          </a>
        )}
      </td>
      <td className="px-3 py-3 text-xs text-muted-foreground">
        <ExpandableText text={comment || "—"} />
      </td>
      {showActions && (
        <td className="px-2 py-3 text-right">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="Actions sur la mission"
                className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
              >
                <MoreVertical className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {onEdit && (
                // L'ouverture du dialog est différée d'un tick : sinon, ouvrir un Dialog
                // depuis le onSelect d'un DropdownMenuItem (dans la même passe que la
                // fermeture du menu) peut laisser `pointer-events: none` bloqué sur
                // <body> côté Radix, rendant la page injouable jusqu'au rechargement.
                <DropdownMenuItem onSelect={() => setTimeout(onEdit, 0)}>
                  <Pencil className="h-3.5 w-3.5" /> Modifier
                </DropdownMenuItem>
              )}
              {onDelete && (
                <DropdownMenuItem
                  onSelect={() => setTimeout(onDelete, 0)}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Supprimer
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </td>
      )}
    </tr>
  );
}
