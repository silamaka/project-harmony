import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Trash2 } from "lucide-react";
import { cloneElement, isValidElement, useId, useState } from "react";
import type { ReactElement, ReactNode } from "react";
import { toast } from "sonner";
import { AvatarPicker } from "@/components/shared/avatar";
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
import { clientService, missionService, projectService, userService } from "@/services";
import {
  MISSION_STATUS_LABELS,
  MISSION_WORKFLOW,
  PRIORITY_LABELS,
  PROJECT_STATUS_LABELS,
  type Client,
  type Mission,
  type MissionStatus,
  type Priority,
  type Project,
  type ProjectStatus,
} from "@/types";

const selectClass =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

function Field({ label, children }: { label: string; children: ReactNode }) {
  const id = useId();
  const control = isValidElement(children)
    ? cloneElement(children as ReactElement<{ id?: string }>, { id })
    : children;
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      {control}
    </div>
  );
}

/** Bouton de suppression avec confirmation. */
export function ConfirmDeleteButton({
  label = "Supprimer",
  title,
  description,
  onConfirm,
  pending = false,
  iconOnly = false,
  open: controlledOpen,
  onOpenChange: setControlledOpen,
}: {
  label?: string;
  title: string;
  description: string;
  onConfirm: () => void;
  pending?: boolean;
  iconOnly?: boolean;
  /** Fournir open/onOpenChange pour piloter le dialog depuis l'extérieur et masquer le bouton déclencheur intégré. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const controlled = controlledOpen !== undefined && setControlledOpen !== undefined;
  const open = controlled ? controlledOpen : internalOpen;
  const setOpen = controlled ? setControlledOpen : setInternalOpen;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!controlled && (
        <DialogTrigger asChild>
          {iconOnly ? (
            <Button
              variant="outline"
              size="icon"
              aria-label={label}
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          ) : (
            <Button variant="outline" size="sm" className="text-destructive hover:text-destructive">
              <Trash2 className="mr-1 h-3.5 w-3.5" /> {label}
            </Button>
          )}
        </DialogTrigger>
      )}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Annuler
          </Button>
          <Button
            variant="destructive"
            disabled={pending}
            onClick={() => {
              onConfirm();
              setOpen(false);
            }}
          >
            {pending ? "Suppression..." : "Confirmer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function useSaved(keys: string[][], onDone: () => void) {
  const qc = useQueryClient();
  return (message: string) => {
    keys.forEach((key) => void qc.invalidateQueries({ queryKey: key }));
    toast.success(message);
    onDone();
  };
}

/* --------------------------------- Client --------------------------------- */
export function EditClientDialog({ client }: { client: Client }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: client.name,
    industry: client.industry,
    email: client.email,
    phone: client.phone ?? "",
    address: client.address ?? "",
    password: "",
    status: client.status,
    logo_url: client.logo_url ?? "",
    created_at: client.created_at.slice(0, 10),
  });
  const done = useSaved([["clients"], ["clients", client.id]], () => setOpen(false));

  const mutation = useMutation({
    mutationFn: () => {
      const { password: _password, ...rest } = form;
      return clientService.update(client.id, { ...rest, name: form.name.trim() });
    },
    onSuccess: () => done("Client mis à jour."),
    onError: () => toast.error("Mise à jour impossible."),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Pencil className="mr-1 h-3.5 w-3.5" /> Modifier
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Modifier le client</DialogTitle>
          <DialogDescription>Mettez à jour la fiche du compte client.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label="Logo">
              <AvatarPicker
                value={form.logo_url}
                onChange={(logo_url) => setForm({ ...form, logo_url })}
                fallbackInitials={form.name.slice(0, 2).toUpperCase()}
              />
            </Field>
          </div>
          <Field label="Nom">
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="Secteur">
            <Input
              value={form.industry}
              onChange={(e) => setForm({ ...form, industry: e.target.value })}
            />
          </Field>
          <Field label="E-mail">
            <Input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </Field>
          <Field label="Téléphone">
            <Input
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </Field>
          <Field label="Adresse">
            <Input
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
            />
          </Field>
          <Field label="Mot de passe">
            <Input
              type="password"
              autoComplete="new-password"
              placeholder="Laisser vide pour ne pas changer"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
          </Field>
          <Field label="Statut">
            <select
              className={selectClass}
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value as Client["status"] })}
            >
              <option value="prospect">Prospect</option>
              <option value="actif">Actif</option>
              <option value="inactif">Inactif</option>
            </select>
          </Field>
          <Field label="Date de création">
            <Input
              type="date"
              value={form.created_at}
              onChange={(e) => setForm({ ...form, created_at: e.target.value })}
            />
          </Field>
        </div>
        <DialogFooter>
          <Button
            disabled={!form.name.trim() || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? "Enregistrement..." : "Enregistrer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* --------------------------------- Projet --------------------------------- */
export function EditProjectDialog({
  project,
  iconOnly = false,
}: {
  project: Project;
  iconOnly?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const { data: users } = useQuery({ queryKey: ["users"], queryFn: userService.list });
  const managers = (users ?? []).filter((u) => u.role === "admin" || u.role === "chef_projet");
  const [form, setForm] = useState({
    name: project.name,
    description: project.description,
    owner_id: project.owner_id,
    status: project.status,
    progress: project.progress,
    start_date: project.start_date.slice(0, 10),
    end_date: project.end_date.slice(0, 10),
  });
  const done = useSaved([["projects"], ["projects", project.id]], () => setOpen(false));

  const mutation = useMutation({
    mutationFn: () =>
      projectService.update(project.id, {
        ...form,
        name: form.name.trim(),
        progress: Math.max(0, Math.min(100, Number(form.progress) || 0)),
      }),
    onSuccess: () => done("Projet mis à jour."),
    onError: () => toast.error("Mise à jour impossible."),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {iconOnly ? (
          <Button variant="outline" size="icon" aria-label="Modifier">
            <Pencil className="h-3.5 w-3.5" />
          </Button>
        ) : (
          <Button variant="outline" size="sm">
            <Pencil className="mr-1 h-3.5 w-3.5" /> Modifier
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Modifier le projet</DialogTitle>
          <DialogDescription>Responsable, statut, progression et échéances.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label="Nom du projet">
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </Field>
          </div>
          <Field label="Chef de projet">
            <select
              className={selectClass}
              value={form.owner_id}
              onChange={(e) => setForm({ ...form, owner_id: e.target.value })}
            >
              {managers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.first_name} {u.last_name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Statut">
            <select
              className={selectClass}
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value as ProjectStatus })}
            >
              {Object.entries(PROJECT_STATUS_LABELS).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Progression (%)">
            <Input
              type="number"
              min={0}
              max={100}
              value={form.progress}
              onChange={(e) => setForm({ ...form, progress: Number(e.target.value) })}
            />
          </Field>
          <Field label="Début">
            <Input
              type="date"
              value={form.start_date}
              onChange={(e) => setForm({ ...form, start_date: e.target.value })}
            />
          </Field>
          <Field label="Échéance">
            <Input
              type="date"
              value={form.end_date}
              onChange={(e) => setForm({ ...form, end_date: e.target.value })}
            />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Description">
              <Textarea
                value={form.description}
                maxLength={500}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </Field>
          </div>
        </div>
        <DialogFooter>
          <Button
            disabled={!form.name.trim() || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? "Enregistrement..." : "Enregistrer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* -------------------------------- Mission --------------------------------- */
export function EditMissionDialog({
  mission,
  open: controlledOpen,
  onOpenChange: setControlledOpen,
}: {
  mission: Mission;
  /** Fournir open/onOpenChange pour piloter le dialog depuis l'extérieur (ex. menu contextuel de tableau) et masquer le bouton déclencheur intégré. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const controlled = controlledOpen !== undefined && setControlledOpen !== undefined;
  const open = controlled ? controlledOpen : internalOpen;
  const setOpen = controlled ? setControlledOpen : setInternalOpen;
  const { data: users } = useQuery({ queryKey: ["users"], queryFn: userService.list });
  const { data: projects } = useQuery({ queryKey: ["projects"], queryFn: projectService.list });
  const assignees = (users ?? []).filter((u) => u.role !== "client");
  const [form, setForm] = useState({
    title: mission.title,
    description: mission.description,
    objective: mission.objective,
    strategy: mission.strategy,
    resources: mission.resources,
    priority: mission.priority,
    status: mission.status,
    assignee_id: mission.assignee_id,
    project_id: mission.project_id,
    created_at: mission.created_at.slice(0, 10),
    deadline: mission.deadline.slice(0, 10),
  });
  const done = useSaved([["missions"], ["missions", mission.id]], () => setOpen(false));

  const mutation = useMutation({
    mutationFn: () => {
      const project = (projects ?? []).find((p) => p.id === form.project_id);
      return missionService.update(mission.id, {
        ...form,
        title: form.title.trim(),
        ...(project ? { client_id: project.client_id } : {}),
      });
    },
    onSuccess: () => done("Mission mise à jour."),
    onError: () => toast.error("Mise à jour impossible."),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!controlled && (
        <DialogTrigger asChild>
          <Button variant="outline" size="sm">
            <Pencil className="mr-1 h-3.5 w-3.5" /> Modifier
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Modifier la mission</DialogTitle>
          <DialogDescription>Brief, assignation, priorité et échéance.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label="Titre">
              <Input
                value={form.title}
                maxLength={140}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </Field>
          </div>
          <Field label="Projet">
            <select
              className={selectClass}
              value={form.project_id}
              onChange={(e) => setForm({ ...form, project_id: e.target.value })}
            >
              {(projects ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Assigné à">
            <select
              className={selectClass}
              value={form.assignee_id}
              onChange={(e) => setForm({ ...form, assignee_id: e.target.value })}
            >
              {assignees.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.first_name} {u.last_name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Priorité">
            <select
              className={selectClass}
              value={form.priority}
              onChange={(e) => setForm({ ...form, priority: e.target.value as Priority })}
            >
              {Object.entries(PRIORITY_LABELS).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Statut">
            <select
              className={selectClass}
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value as MissionStatus })}
            >
              {MISSION_WORKFLOW.map((s) => (
                <option key={s} value={s}>
                  {MISSION_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Date de création">
            <Input
              type="date"
              value={form.created_at}
              onChange={(e) => setForm({ ...form, created_at: e.target.value })}
            />
          </Field>
          <Field label="Deadline">
            <Input
              type="date"
              value={form.deadline}
              onChange={(e) => setForm({ ...form, deadline: e.target.value })}
            />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Description">
              <Textarea
                value={form.description}
                maxLength={800}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </Field>
          </div>
          <Field label="Objectif">
            <Input
              value={form.objective}
              onChange={(e) => setForm({ ...form, objective: e.target.value })}
            />
          </Field>
          <Field label="Stratégie">
            <Input
              value={form.strategy}
              onChange={(e) => setForm({ ...form, strategy: e.target.value })}
            />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Ressources">
              <Input
                value={form.resources}
                onChange={(e) => setForm({ ...form, resources: e.target.value })}
              />
            </Field>
          </div>
        </div>
        <DialogFooter>
          <Button
            disabled={!form.title.trim() || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? "Enregistrement..." : "Enregistrer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
