import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Target } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { CampaignDialog } from "@/components/shared/campaign-dialog";
import { CampaignProgress, CampaignStatusBadge } from "@/components/shared/campaign-ui";
import { useAuth } from "@/context/auth-context";
import { formatCount, formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import { campaignService, clientService } from "@/services";
import {
  CAMPAIGN_PLATFORM_LABELS,
  CAMPAIGN_RESULT_UNIT,
  CAMPAIGN_STATUS_LABELS,
  type CampaignStatus,
} from "@/types";

export const Route = createFileRoute("/campagnes/")({
  head: () => ({
    meta: [
      { title: "Campagnes — OLYMPE" },
      {
        name: "description",
        content: "Suivi des campagnes publicitaires : objectif, budget, résultats.",
      },
    ],
  }),
  component: CampaignsPage,
});

const STATUS_FILTERS = ["tous", "preparation", "en_cours", "pause", "terminee"] as const;

const formatDate = (iso: string) => new Date(iso).toLocaleDateString("fr-FR");

function CampaignsPage() {
  const { user, hasRole } = useAuth();
  const isClient = user?.role === "client";
  const canManage = hasRole("admin", "chef_projet");
  const { data: campaigns, isLoading } = useQuery({
    queryKey: ["campaigns"],
    queryFn: campaignService.list,
  });
  const { data: clients } = useQuery({ queryKey: ["clients"], queryFn: clientService.list });
  const [status, setStatus] = useState<(typeof STATUS_FILTERS)[number]>("tous");
  const [clientFilter, setClientFilter] = useState("");

  const clientName = (id: string) => clients?.find((c) => c.id === id)?.name ?? "—";
  // Le client ne voit jamais les campagnes en préparation (le serveur ne les
  // lui envoie pas) : inutile de lui proposer ce filtre.
  const statusOptions = STATUS_FILTERS.filter((s) => !isClient || s !== "preparation");
  const filtered = useMemo(
    () =>
      (campaigns ?? []).filter(
        (c) =>
          (status === "tous" || c.status === status) &&
          (!clientFilter || c.client_id === clientFilter),
      ),
    [campaigns, status, clientFilter],
  );
  const clientOptions = useMemo(
    () =>
      [...(clients ?? [])]
        .filter((c) => (campaigns ?? []).some((x) => x.client_id === c.id))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [clients, campaigns],
  );

  return (
    <AppShell
      title="Campagnes"
      subtitle={isClient ? "Vos campagnes publicitaires" : "Campagnes publicitaires des clients"}
      allow={["admin", "chef_projet", "collaborateur", "client"]}
      actions={canManage ? <CampaignDialog /> : undefined}
    >
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-1 rounded-lg border border-border p-1">
          {statusOptions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatus(s)}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                status === s
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent",
              )}
            >
              {s === "tous" ? "Toutes" : CAMPAIGN_STATUS_LABELS[s as CampaignStatus]}
            </button>
          ))}
        </div>
        {!isClient && clientOptions.length > 0 && (
          <select
            aria-label="Filtrer par client"
            value={clientFilter}
            onChange={(e) => setClientFilter(e.target.value)}
            className={cn(
              "h-9 rounded-md border border-input bg-background px-3 text-sm",
              clientFilter && "border-primary text-primary",
            )}
          >
            <option value="">Tous les clients</option>
            {clientOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {isLoading && <p className="mt-6 text-sm text-muted-foreground">Chargement…</p>}
      {!isLoading && filtered.length === 0 && (
        <div className="surface-card mt-6 flex flex-col items-center gap-2 p-10 text-center">
          <Target className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm font-medium">Aucune campagne</p>
          <p className="max-w-sm text-xs text-muted-foreground">
            {isClient
              ? "Vos campagnes publicitaires apparaîtront ici dès leur lancement."
              : "Crée une campagne pour suivre son objectif, son budget et ses résultats."}
          </p>
        </div>
      )}

      <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {filtered.map((c) => {
          const unit = CAMPAIGN_RESULT_UNIT[c.objective];
          return (
            <Link
              key={c.id}
              to="/campagnes/$campaignId"
              params={{ campaignId: c.id }}
              className="surface-card flex h-full flex-col gap-3 p-5 transition-shadow hover:shadow-[var(--shadow-elevated)]"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="truncate font-semibold">{c.name}</h3>
                  {!isClient && (
                    <p className="truncate text-xs text-muted-foreground">
                      {clientName(c.client_id)}
                    </p>
                  )}
                </div>
                <CampaignStatusBadge status={c.status} />
              </div>
              <div className="flex flex-wrap gap-1">
                {c.platforms.map((p) => (
                  <span
                    key={p}
                    className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
                  >
                    {CAMPAIGN_PLATFORM_LABELS[p]}
                  </span>
                ))}
                <span className="ml-auto text-[11px] text-muted-foreground">
                  {formatDate(c.start_date)}
                  {c.end_date && ` → ${formatDate(c.end_date)}`}
                </span>
              </div>
              <CampaignProgress
                label="Budget dépensé"
                value={c.summary.budget_used}
                detail={`${formatMoney(c.summary.spend)} sur ${formatMoney(c.budget_ht)} HT`}
                warnAbove={90}
              />
              <CampaignProgress
                label="Objectif"
                value={c.summary.results_progress}
                detail={
                  c.objective_target
                    ? `${formatCount(c.summary.results)} ${unit} sur ${formatCount(c.objective_target)}`
                    : `${formatCount(c.summary.results)} ${unit}`
                }
              />
              <p className="mt-auto border-t border-border pt-3 text-xs text-muted-foreground">
                Coût par résultat :{" "}
                <span className="font-semibold text-foreground">
                  {formatMoney(c.summary.cost_per_result)}
                </span>
                {c.summary.last_report_date
                  ? ` · relevé du ${formatDate(c.summary.last_report_date)}`
                  : " · aucun relevé"}
              </p>
            </Link>
          );
        })}
      </div>
    </AppShell>
  );
}
