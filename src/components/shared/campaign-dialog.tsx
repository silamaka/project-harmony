import { useId, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { errorMessage } from "@/lib/api";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import {
  campaignService,
  clientService,
  deliverableService,
  missionService,
  projectService,
} from "@/services";
import {
  CAMPAIGN_OBJECTIVE_LABELS,
  CAMPAIGN_PLATFORM_LABELS,
  CAMPAIGN_STATUS_LABELS,
  type Campaign,
  type CampaignInput,
  type CampaignObjective,
  type CampaignPlatform,
  type CampaignStatus,
} from "@/types";

const selectClass =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

const emptyForm = (clientId = ""): CampaignInput => ({
  client_id: clientId,
  project_id: null,
  name: "",
  platforms: ["meta"],
  objective: "messages",
  objective_target: null,
  start_date: new Date().toISOString().slice(0, 10),
  end_date: null,
  status: "preparation",
  budget_ht: 0,
  tva_rate: 18,
  paid_by: "client",
  targeting: "",
  internal_notes: "",
  content_ids: [],
});

const fromCampaign = (c: Campaign): CampaignInput => ({
  client_id: c.client_id,
  project_id: c.project_id,
  name: c.name,
  platforms: c.platforms,
  objective: c.objective,
  objective_target: c.objective_target,
  start_date: c.start_date,
  end_date: c.end_date,
  status: c.status,
  budget_ht: c.budget_ht,
  tva_rate: c.tva_rate,
  paid_by: c.paid_by,
  targeting: c.targeting,
  internal_notes: c.internal_notes ?? "",
  content_ids: c.content_ids,
});

/** Création (sans `campaign`) ou modification d'une campagne publicitaire. */
export function CampaignDialog({ campaign }: { campaign?: Campaign }) {
  const qc = useQueryClient();
  const formId = useId();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<CampaignInput>(() =>
    campaign ? fromCampaign(campaign) : emptyForm(),
  );
  const set = <K extends keyof CampaignInput>(key: K, value: CampaignInput[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const { data: clients } = useQuery({ queryKey: ["clients"], queryFn: clientService.list });
  const { data: projects } = useQuery({ queryKey: ["projects"], queryFn: projectService.list });
  const { data: missions } = useQuery({ queryKey: ["missions"], queryFn: missionService.list });
  const { data: deliverables } = useQuery({
    queryKey: ["deliverables"],
    queryFn: deliverableService.list,
  });

  const clientProjects = (projects ?? []).filter((p) => p.client_id === form.client_id);
  // Visuels possibles : les contenus déposés pour ce client.
  const clientContents = useMemo(() => {
    const missionIds = new Set(
      (missions ?? []).filter((m) => m.client_id === form.client_id).map((m) => m.id),
    );
    return (deliverables ?? []).filter(
      (d) => missionIds.has(d.mission_id) && d.nature !== "document",
    );
  }, [missions, deliverables, form.client_id]);

  const tva = Math.round((form.budget_ht * form.tva_rate) / 100);
  const mutation = useMutation({
    mutationFn: () =>
      campaign ? campaignService.update(campaign.id, form) : campaignService.create(form),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["campaigns"] });
      toast.success(campaign ? "Campagne mise à jour." : "Campagne créée.");
      setOpen(false);
      if (!campaign) setForm(emptyForm());
    },
    onError: (error) => toast.error(errorMessage(error, "Enregistrement impossible.")),
  });

  const togglePlatform = (p: CampaignPlatform) =>
    set(
      "platforms",
      form.platforms.includes(p) ? form.platforms.filter((x) => x !== p) : [...form.platforms, p],
    );
  const toggleContent = (id: string) =>
    set(
      "content_ids",
      form.content_ids.includes(id)
        ? form.content_ids.filter((x) => x !== id)
        : [...form.content_ids, id],
    );
  const invalid =
    !form.name.trim() ||
    !form.client_id ||
    !form.start_date ||
    (!!form.end_date && form.end_date < form.start_date);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (o) setForm(campaign ? fromCampaign(campaign) : emptyForm());
        setOpen(o);
      }}
    >
      <DialogTrigger asChild>
        {campaign ? (
          <Button variant="outline" size="sm">
            <Pencil className="mr-1 h-3.5 w-3.5" /> Modifier
          </Button>
        ) : (
          <Button size="sm">
            <Plus className="mr-1 h-4 w-4" /> Nouvelle campagne
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{campaign ? "Modifier la campagne" : "Nouvelle campagne"}</DialogTitle>
          <DialogDescription>
            Campagne publicitaire d'un client : objectif, budget et visuels utilisés.
          </DialogDescription>
        </DialogHeader>

        <form
          id={formId}
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!invalid) mutation.mutate();
          }}
        >
          <Field label="Nom de la campagne">
            <Input
              value={form.name}
              maxLength={200}
              placeholder="Ex. Lancement boutique — novembre"
              onChange={(e) => set("name", e.target.value)}
            />
          </Field>
          <Field label="Client">
            <select
              className={selectClass}
              value={form.client_id}
              disabled={!!campaign}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  client_id: e.target.value,
                  project_id: null,
                  content_ids: [],
                }))
              }
            >
              <option value="">Choisir un client</option>
              {[...(clients ?? [])]
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </select>
          </Field>

          <Field label="Projet (facultatif)">
            <select
              className={selectClass}
              value={form.project_id ?? ""}
              disabled={!form.client_id}
              onChange={(e) => set("project_id", e.target.value || null)}
            >
              <option value="">Aucun</option>
              {clientProjects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Statut">
            <select
              className={selectClass}
              value={form.status}
              onChange={(e) => set("status", e.target.value as CampaignStatus)}
            >
              {Object.entries(CAMPAIGN_STATUS_LABELS).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </Field>

          <div className="sm:col-span-2">
            <Field label="Plateformes">
              <div className="flex flex-wrap gap-1.5">
                {(Object.keys(CAMPAIGN_PLATFORM_LABELS) as CampaignPlatform[]).map((p) => (
                  <button
                    key={p}
                    type="button"
                    aria-pressed={form.platforms.includes(p)}
                    onClick={() => togglePlatform(p)}
                    className={cn(
                      "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                      form.platforms.includes(p)
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:border-primary/40",
                    )}
                  >
                    {CAMPAIGN_PLATFORM_LABELS[p]}
                  </button>
                ))}
              </div>
            </Field>
          </div>

          <Field label="Objectif">
            <select
              className={selectClass}
              value={form.objective}
              onChange={(e) => set("objective", e.target.value as CampaignObjective)}
            >
              {Object.entries(CAMPAIGN_OBJECTIVE_LABELS).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Cible chiffrée" hint="Ex. 200 messages. Vide pour la notoriété.">
            <Input
              type="number"
              min={0}
              value={form.objective_target ?? ""}
              onChange={(e) =>
                set("objective_target", e.target.value === "" ? null : Number(e.target.value))
              }
            />
          </Field>

          <Field label="Début">
            <Input
              type="date"
              value={form.start_date}
              onChange={(e) => set("start_date", e.target.value)}
            />
          </Field>
          <Field label="Fin (facultatif)">
            <Input
              type="date"
              value={form.end_date ?? ""}
              min={form.start_date}
              onChange={(e) => set("end_date", e.target.value || null)}
            />
          </Field>

          <Field label="Budget HT (FCFA)">
            <Input
              type="number"
              min={0}
              value={form.budget_ht || ""}
              onChange={(e) => set("budget_ht", Number(e.target.value || 0))}
            />
          </Field>
          <Field
            label="TVA (%)"
            hint={`TVA ${formatMoney(tva)} · TTC ${formatMoney(form.budget_ht + tva)}`}
          >
            <Input
              type="number"
              min={0}
              max={100}
              step="0.01"
              value={form.tva_rate}
              onChange={(e) => set("tva_rate", Number(e.target.value || 0))}
            />
          </Field>

          <Field label="Le budget publicitaire passe par">
            <select
              className={selectClass}
              value={form.paid_by}
              onChange={(e) => set("paid_by", e.target.value as "client" | "agence")}
            >
              <option value="client">Le compte du client</option>
              <option value="agence">Le compte de l'agence (refacturé)</option>
            </select>
          </Field>
          <div />

          <div className="sm:col-span-2">
            <Field label="Ciblage" hint="Zone, âge, centres d'intérêt… Visible du client.">
              <Textarea
                value={form.targeting}
                rows={2}
                onChange={(e) => set("targeting", e.target.value)}
              />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="Notes internes" hint="Jamais montrées au client.">
              <Textarea
                value={form.internal_notes ?? ""}
                rows={2}
                onChange={(e) => set("internal_notes", e.target.value)}
              />
            </Field>
          </div>

          <div className="sm:col-span-2">
            <Field
              label={`Visuels de la campagne (${form.content_ids.length})`}
              hint="Les contenus déjà déposés pour ce client."
            >
              {!form.client_id ? (
                <p className="text-xs text-muted-foreground">Choisis d'abord le client.</p>
              ) : clientContents.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Aucun contenu déposé pour ce client.
                </p>
              ) : (
                <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border border-border p-2">
                  {clientContents.map((d) => (
                    <label key={d.id} className="flex cursor-pointer items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={form.content_ids.includes(d.id)}
                        onChange={() => toggleContent(d.id)}
                        className="h-3.5 w-3.5 accent-[var(--color-primary)]"
                      />
                      <span className="truncate">{d.name}</span>
                      <span className="text-[11px] text-muted-foreground">v{d.version}</span>
                    </label>
                  ))}
                </div>
              )}
            </Field>
          </div>
        </form>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Annuler
          </Button>
          <Button type="submit" form={formId} disabled={invalid || mutation.isPending}>
            {mutation.isPending
              ? "Enregistrement..."
              : campaign
                ? "Enregistrer"
                : "Créer la campagne"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
