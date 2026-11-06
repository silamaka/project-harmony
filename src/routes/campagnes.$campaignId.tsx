import { useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Plus, Trash2, X } from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/app-shell";
import { CampaignDialog } from "@/components/shared/campaign-dialog";
import { CampaignProgress, CampaignStatusBadge } from "@/components/shared/campaign-ui";
import { campaignStatusTone } from "@/lib/campaign";
import { PillSelect } from "@/components/shared/pill-select";
import { ConfirmDeleteButton } from "@/components/shared/edit-dialogs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/context/auth-context";
import { errorMessage } from "@/lib/api";
import { formatCount, formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import { campaignService, clientService, deliverableService, projectService } from "@/services";
import {
  CAMPAIGN_OBJECTIVE_LABELS,
  CAMPAIGN_PLATFORM_LABELS,
  CAMPAIGN_RESULT_UNIT,
  CAMPAIGN_STATUS_LABELS,
  type CampaignReport,
  type CampaignStatus,
} from "@/types";

export const Route = createFileRoute("/campagnes/$campaignId")({
  head: () => ({ meta: [{ title: "Campagne — OLYMPE" }] }),
  component: CampaignPage,
});

const formatDate = (iso: string) => new Date(iso).toLocaleDateString("fr-FR");

function Kpi({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="surface-card p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-extrabold tabular-nums">{value}</p>
      {detail && <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p>}
    </div>
  );
}

function Info({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[8.5rem_1fr] gap-2 text-sm">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <div className="min-w-0 whitespace-pre-wrap [overflow-wrap:anywhere]">{children}</div>
    </div>
  );
}

function CampaignPage() {
  const { campaignId } = Route.useParams();
  const { user, hasRole } = useAuth();
  const isClient = user?.role === "client";
  const canManage = hasRole("admin", "chef_projet");
  const qc = useQueryClient();
  const navigate = useNavigate();

  const { data: campaign, isLoading } = useQuery({
    queryKey: ["campaigns", campaignId],
    queryFn: () => campaignService.get(campaignId),
  });
  const { data: clients } = useQuery({ queryKey: ["clients"], queryFn: clientService.list });
  const { data: projects } = useQuery({ queryKey: ["projects"], queryFn: projectService.list });
  const { data: deliverables } = useQuery({
    queryKey: ["deliverables"],
    queryFn: deliverableService.list,
  });

  const refresh = () => void qc.invalidateQueries({ queryKey: ["campaigns"] });
  const remove = useMutation({
    mutationFn: () => campaignService.remove(campaignId),
    onSuccess: () => {
      refresh();
      toast.success("Campagne supprimée.");
      void navigate({ to: "/campagnes" });
    },
    onError: (error) => toast.error(errorMessage(error, "Suppression impossible.")),
  });
  const [deletingReport, setDeletingReport] = useState<CampaignReport | null>(null);
  const [showReportForm, setShowReportForm] = useState(false);
  const setStatus = useMutation({
    mutationFn: (status: CampaignStatus) => campaignService.update(campaignId, { status }),
    onSuccess: (_d, status) => {
      refresh();
      toast.success(`Statut : ${CAMPAIGN_STATUS_LABELS[status]}`);
    },
    onError: (error) => toast.error(errorMessage(error, "Changement de statut impossible.")),
  });
  const removeReport = useMutation({
    mutationFn: (reportId: string) => campaignService.removeReport(campaignId, reportId),
    onSuccess: () => {
      refresh();
      setDeletingReport(null);
      toast.success("Relevé supprimé.");
    },
    onError: (error) => toast.error(errorMessage(error, "Suppression impossible.")),
  });

  if (isLoading || !campaign) {
    return (
      <AppShell title="Campagne" allow={["admin", "chef_projet", "collaborateur", "client"]}>
        <p className="text-sm text-muted-foreground">
          {isLoading ? "Chargement…" : "Campagne introuvable."}
        </p>
      </AppShell>
    );
  }

  const s = campaign.summary;
  const unit = CAMPAIGN_RESULT_UNIT[campaign.objective];
  const clientName = clients?.find((c) => c.id === campaign.client_id)?.name;
  const projectName = projects?.find((p) => p.id === campaign.project_id)?.name;
  const contents = (deliverables ?? []).filter((d) => campaign.content_ids.includes(d.id));
  // Du plus récent au plus ancien, avec l'écart par rapport au relevé précédent.
  const rows = [...campaign.reports]
    .map((r, i, all) => ({ r, prev: i > 0 ? all[i - 1] : undefined }))
    .reverse();

  return (
    <AppShell
      title={campaign.name}
      subtitle={[clientName, projectName].filter(Boolean).join(" · ") || undefined}
      allow={["admin", "chef_projet", "collaborateur", "client"]}
      actions={
        canManage ? (
          <div className="flex items-center gap-2">
            <CampaignDialog campaign={campaign} />
            <ConfirmDeleteButton
              title={`Supprimer la campagne « ${campaign.name} » ?`}
              description="La campagne et tous ses relevés seront définitivement supprimés. Les contenus utilisés ne sont pas touchés."
              pending={remove.isPending}
              onConfirm={() => remove.mutate()}
            />
          </div>
        ) : undefined
      }
    >
      <Link
        to="/campagnes"
        className="inline-flex items-center gap-2 text-xs font-medium text-primary hover:underline"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Retour aux campagnes
      </Link>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {canManage ? (
          <div className="w-36">
            <PillSelect
              value={campaign.status}
              options={CAMPAIGN_STATUS_LABELS}
              tone={campaignStatusTone}
              onChange={(status) => setStatus.mutate(status)}
            />
          </div>
        ) : (
          <CampaignStatusBadge status={campaign.status} />
        )}
        {campaign.platforms.map((p) => (
          <span
            key={p}
            className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
          >
            {CAMPAIGN_PLATFORM_LABELS[p]}
          </span>
        ))}
        <span className="text-xs text-muted-foreground">
          {formatDate(campaign.start_date)}
          {campaign.end_date ? ` → ${formatDate(campaign.end_date)}` : " · sans date de fin"}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          label="Dépensé"
          value={formatMoney(s.spend)}
          detail={`sur ${formatMoney(campaign.budget_ht)} HT`}
        />
        <Kpi
          label="Résultats"
          value={formatCount(s.results)}
          detail={
            campaign.objective_target
              ? `${unit}, objectif ${formatCount(campaign.objective_target)}`
              : unit
          }
        />
        <Kpi label="Coût par résultat" value={formatMoney(s.cost_per_result)} />
        <Kpi label="Portée" value={formatCount(s.reach)} detail="personnes touchées" />
      </div>

      <div className="surface-card mt-4 grid gap-4 p-5 md:grid-cols-2">
        <CampaignProgress
          label="Budget dépensé"
          value={s.budget_used}
          detail={`${formatMoney(s.spend)} sur ${formatMoney(campaign.budget_ht)} HT`}
          warnAbove={90}
        />
        <CampaignProgress
          label="Objectif atteint"
          value={s.results_progress}
          detail={
            campaign.objective_target
              ? `${formatCount(s.results)} ${unit} sur ${formatCount(campaign.objective_target)}`
              : "Pas d'objectif chiffré"
          }
        />
      </div>

      {campaign.reports.length >= 2 && (
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <TrendChart
            title="Dépense cumulée"
            reports={campaign.reports}
            pick={(r) => r.spend}
            format={formatMoney}
          />
          <TrendChart
            title={`Résultats cumulés (${unit})`}
            reports={campaign.reports}
            pick={(r) => r.results}
            format={formatCount}
          />
        </div>
      )}

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <div className="surface-card min-w-0 p-5 xl:col-span-2">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <h2 className="text-sm font-semibold">Relevés</h2>
            {canManage && !showReportForm && (
              <Button size="sm" variant="outline" onClick={() => setShowReportForm(true)}>
                <Plus className="mr-1 h-3.5 w-3.5" /> Ajouter un relevé
              </Button>
            )}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Totaux depuis le début de la campagne, tels qu'affichés dans Ads Manager. L'évolution
            indique ce qui a été fait depuis le relevé précédent.
          </p>
          {canManage && showReportForm && (
            <ReportForm
              campaignId={campaign.id}
              reports={campaign.reports}
              onSaved={() => {
                refresh();
                setShowReportForm(false);
              }}
              onCancel={() => setShowReportForm(false)}
            />
          )}
          {rows.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">Aucun relevé pour le moment.</p>
          ) : (
            <>
              <ul className="mt-4 space-y-2 md:hidden">
                {rows.map(({ r, prev }) => (
                  <li key={r.id} className="rounded-lg border border-border p-3 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold">{formatDate(r.date)}</span>
                      {canManage && (
                        <button
                          type="button"
                          aria-label={`Supprimer le relevé du ${formatDate(r.date)}`}
                          onClick={() => setDeletingReport(r)}
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                    <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                      <div>
                        <dt className="text-muted-foreground">Dépense</dt>
                        <dd className="font-medium tabular-nums">
                          {formatMoney(r.spend)}
                          {prev && <Delta value={r.spend - prev.spend} money />}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">Résultats</dt>
                        <dd className="font-medium tabular-nums">
                          {formatCount(r.results)}
                          {prev && <Delta value={r.results - prev.results} />}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">Portée</dt>
                        <dd className="tabular-nums">{formatCount(r.reach)}</dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">Clics</dt>
                        <dd className="tabular-nums">{formatCount(r.clicks)}</dd>
                      </div>
                    </dl>
                  </li>
                ))}
              </ul>
              <div className="mt-4 hidden overflow-x-auto md:block">
                <table className="w-full min-w-[620px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="py-2 font-medium">Date</th>
                      <th className="py-2 font-medium">Dépense</th>
                      <th className="py-2 font-medium">Résultats</th>
                      <th className="py-2 font-medium">Portée</th>
                      <th className="py-2 font-medium">Impressions</th>
                      <th className="py-2 font-medium">Clics</th>
                      {canManage && <th className="py-2" />}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(({ r, prev }) => (
                      <tr key={r.id} className="border-b border-border/60 last:border-0">
                        <td className="py-2.5 font-medium">{formatDate(r.date)}</td>
                        <td className="py-2.5 tabular-nums">
                          {formatMoney(r.spend)}
                          {prev && <Delta value={r.spend - prev.spend} money />}
                        </td>
                        <td className="py-2.5 tabular-nums">
                          {formatCount(r.results)}
                          {prev && <Delta value={r.results - prev.results} />}
                        </td>
                        <td className="py-2.5 tabular-nums">{formatCount(r.reach)}</td>
                        <td className="py-2.5 tabular-nums">{formatCount(r.impressions)}</td>
                        <td className="py-2.5 tabular-nums">{formatCount(r.clicks)}</td>
                        {canManage && (
                          <td className="py-2.5 text-right">
                            <button
                              type="button"
                              aria-label={`Supprimer le relevé du ${formatDate(r.date)}`}
                              onClick={() => setDeletingReport(r)}
                              className="text-muted-foreground hover:text-destructive"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        <div className="space-y-4">
          <div className="surface-card space-y-2.5 p-5">
            <h2 className="text-sm font-semibold">Informations</h2>
            <Info label="Objectif">{CAMPAIGN_OBJECTIVE_LABELS[campaign.objective]}</Info>
            <Info label="Budget HT">{formatMoney(campaign.budget_ht)}</Info>
            <Info label={`TVA (${campaign.tva_rate} %)`}>{formatMoney(s.budget_tva)}</Info>
            <Info label="Budget TTC">
              <span className="font-semibold">{formatMoney(s.budget_ttc)}</span>
            </Info>
            <Info label="Budget payé par">
              {campaign.paid_by === "client" ? "Le compte du client" : "Le compte de l'agence"}
            </Info>
            {campaign.targeting && <Info label="Ciblage">{campaign.targeting}</Info>}
            {!isClient && campaign.internal_notes && (
              <Info label="Notes internes">
                <span className="text-muted-foreground">{campaign.internal_notes}</span>
              </Info>
            )}
          </div>

          <div className="surface-card p-5">
            <h2 className="text-sm font-semibold">Visuels de la campagne ({contents.length})</h2>
            {contents.length === 0 ? (
              <p className="mt-2 text-xs text-muted-foreground">Aucun visuel associé.</p>
            ) : (
              <ul className="mt-2 space-y-1.5">
                {contents.map((d) => (
                  <li key={d.id}>
                    <Link
                      to="/missions/$missionId"
                      params={{ missionId: d.mission_id }}
                      search={{ livrable: d.id }}
                      className="text-sm font-medium text-primary hover:underline"
                    >
                      {d.name}
                    </Link>
                    <span className="ml-1 text-[11px] text-muted-foreground">v{d.version}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      <ConfirmDeleteButton
        open={deletingReport !== null}
        onOpenChange={(o) => !o && setDeletingReport(null)}
        title={`Supprimer le relevé du ${deletingReport ? formatDate(deletingReport.date) : ""} ?`}
        description="Ses chiffres seront définitivement retirés ; les totaux de la campagne reviendront au relevé précédent."
        pending={removeReport.isPending}
        onConfirm={() => deletingReport && removeReport.mutate(deletingReport.id)}
      />
    </AppShell>
  );
}

/** Évolution d'une mesure, relevé après relevé. Une mesure par graphique :
 * dépense et résultats n'ont pas la même échelle (jamais de double axe). */
function TrendChart({
  title,
  reports,
  pick,
  format,
}: {
  title: string;
  reports: CampaignReport[];
  pick: (r: CampaignReport) => number;
  format: (v: number) => string;
}) {
  const data = reports.map((r) => ({
    date: new Date(r.date).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" }),
    value: pick(r),
  }));
  return (
    <div className="surface-card p-5">
      <h2 className="text-sm font-semibold">{title}</h2>
      <div className="mt-3 h-40">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="date"
              stroke="var(--color-muted-foreground)"
              fontSize={11}
              tickLine={false}
            />
            <YAxis
              stroke="var(--color-muted-foreground)"
              fontSize={11}
              tickLine={false}
              width={44}
              allowDecimals={false}
              tickFormatter={(v: number) =>
                v >= 1000 ? `${Math.round(v / 1000).toLocaleString("fr-FR")} k` : String(v)
              }
            />
            <Tooltip
              formatter={(v: number) => [format(v), title]}
              contentStyle={{
                background: "var(--color-popover)",
                border: "1px solid var(--color-border)",
                borderRadius: 12,
                fontSize: 12,
              }}
            />
            <Line
              type="monotone"
              dataKey="value"
              stroke="var(--color-primary)"
              strokeWidth={2}
              dot={{ r: 4, strokeWidth: 2, fill: "var(--color-card)" }}
              activeDot={{ r: 5 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function Delta({ value, money = false }: { value: number; money?: boolean }) {
  if (value === 0) return null;
  return (
    <span className={cn("ml-1.5 text-[11px]", value > 0 ? "text-success" : "text-destructive")}>
      {value > 0 ? "+" : ""}
      {money ? formatMoney(value) : formatCount(value)}
    </span>
  );
}

const today = () => new Date().toISOString().slice(0, 10);

/** Saisie d'un relevé : les totaux du jour, recopiés depuis Ads Manager. */
function ReportForm({
  campaignId,
  reports,
  onSaved,
  onCancel,
}: {
  campaignId: string;
  reports: CampaignReport[];
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [date, setDate] = useState(today);
  // Second clic après l'avertissement : enregistrer malgré la baisse.
  const [confirmLower, setConfirmLower] = useState(false);
  const [values, setValues] = useState({
    spend: "",
    results: "",
    reach: "",
    impressions: "",
    clicks: "",
  });
  const num = (v: string) => (v.trim() === "" ? null : Number(v));
  // Totaux depuis le début : un chiffre plus bas que le relevé précédent est
  // presque toujours une faute de frappe (ou une vraie correction, d'où un
  // avertissement et non un blocage).
  const previous = [...reports].filter((r) => r.date < date).at(-1);
  const LABELS = {
    spend: "la dépense",
    results: "les résultats",
    reach: "la portée",
    impressions: "les impressions",
    clicks: "les clics",
  } as const;
  const lower = previous
    ? (Object.keys(LABELS) as (keyof typeof LABELS)[]).filter((k) => {
        const typed = num(values[k]);
        const before = previous[k];
        return typed !== null && before !== null && typed < before;
      })
    : [];
  const save = useMutation({
    mutationFn: () =>
      campaignService.addReport(campaignId, {
        date,
        spend: Number(values.spend || 0),
        results: Number(values.results || 0),
        reach: num(values.reach),
        impressions: num(values.impressions),
        clicks: num(values.clicks),
      } satisfies Omit<CampaignReport, "id" | "created_at">),
    onSuccess: () => {
      onSaved();
      setValues({ spend: "", results: "", reach: "", impressions: "", clicks: "" });
      setConfirmLower(false);
      toast.success("Relevé enregistré.");
    },
    onError: (error) => toast.error(errorMessage(error, "Relevé impossible.")),
  });
  const field = (key: keyof typeof values, label: string) => (
    <label className="space-y-1">
      <span className="block text-[11px] font-medium text-muted-foreground">{label}</span>
      <Input
        type="number"
        min={0}
        value={values[key]}
        onChange={(e) => {
          setValues((v) => ({ ...v, [key]: e.target.value }));
          setConfirmLower(false);
        }}
        className="h-9"
      />
    </label>
  );
  return (
    <form
      className="mt-3 grid grid-cols-2 items-end gap-2 rounded-lg border border-dashed border-border p-3 sm:grid-cols-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (lower.length > 0 && !confirmLower) {
          setConfirmLower(true);
          return;
        }
        save.mutate();
      }}
    >
      <label className="space-y-1">
        <span className="block text-[11px] font-medium text-muted-foreground">Date</span>
        <Input
          type="date"
          value={date}
          onChange={(e) => {
            setDate(e.target.value);
            setConfirmLower(false);
          }}
          className="h-9"
        />
      </label>
      {field("spend", "Dépense (FCFA)")}
      {field("results", "Résultats")}
      {field("reach", "Portée")}
      {field("impressions", "Impressions")}
      {field("clicks", "Clics")}
      <Button
        type="submit"
        size="sm"
        variant={confirmLower ? "destructive" : "default"}
        className="h-9"
        disabled={!date || save.isPending}
      >
        {save.isPending ? "…" : confirmLower ? "Enregistrer quand même" : "Ajouter"}
      </Button>
      <Button type="button" size="sm" variant="ghost" className="h-9" onClick={onCancel}>
        <X className="mr-1 h-3.5 w-3.5" /> Annuler
      </Button>
      {values.spend.trim() !== "" && (
        <p className="col-span-full text-[11px] text-muted-foreground">
          Dépense saisie : {formatMoney(Number(values.spend))}
        </p>
      )}
      {confirmLower && previous && (
        <p role="alert" className="col-span-full text-xs text-warning">
          Attention, ces chiffres sont plus bas qu'au relevé du {formatDate(previous.date)} :{" "}
          {lower.map((k) => LABELS[k]).join(", ")}. Ce sont des totaux depuis le début : vérifie la
          saisie, ou clique à nouveau pour corriger volontairement.
        </p>
      )}
    </form>
  );
}
