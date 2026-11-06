import { cn } from "@/lib/utils";
import { campaignStatusTone } from "@/lib/campaign";
import { CAMPAIGN_STATUS_LABELS, type CampaignStatus } from "@/types";

export function CampaignStatusBadge({ status }: { status: CampaignStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold",
        campaignStatusTone[status],
      )}
    >
      {CAMPAIGN_STATUS_LABELS[status]}
    </span>
  );
}

/** Barre d'avancement libellée (budget dépensé, résultats face à l'objectif). */
export function CampaignProgress({
  label,
  value,
  detail,
  warnAbove,
}: {
  label: string;
  /** Pourcentage, ou null quand il n'y a pas de base (pas d'objectif chiffré). */
  value: number | null;
  detail: string;
  /** Au-delà, la barre passe en orange (ex. budget dépensé à 90 %). */
  warnAbove?: number;
}) {
  const pct = value === null ? 0 : Math.min(100, Math.max(0, value));
  const warn = warnAbove !== undefined && value !== null && value >= warnAbove;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-semibold tabular-nums">{value === null ? "—" : `${value} %`}</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full transition-all", warn ? "bg-warning" : "bg-primary")}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="mt-0.5 text-[11px] text-muted-foreground">{detail}</p>
    </div>
  );
}
