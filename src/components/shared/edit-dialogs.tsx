import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Trash2, X } from "lucide-react";
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

/** Personne assignée, affichée comme un tag amovible (ou fixe si `onRemove` est omis). */
function PersonPill({ name, onRemove }: { name: string; onRemove?: (() => void) | undefined }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-accent px-2.5 py-1 text-xs font-medium text-accent-foreground">
      {name}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Retirer ${name}`}
          className="text-accent-foreground/70 hover:text-accent-foreground"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </span>
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
    status: client.status,
    logo_url: client.logo_url ?? "",
  });
  const done = useSaved([["clients"], ["clients", client.id]], () => setOpen(false));

  const mutation = useMutation({
    mutationFn: () => clientService.update(client.id, { ...form, name: form.name.trim() }),
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
    start_date: project.start_date.slice(0, 10),
    end_date: project.end_date.slice(0, 10),
  });
  const done = useSaved([["projects"], ["projects", project.id]], () => setOpen(false));

  const mutation = useMutation({
    mutationFn: () =>
      projectService.update(project.id, {
        ...form,
        name: form.name.trim(),
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
          <DialogDescription>Responsable, statut et échéances.</DialogDescription>
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
  const nameOf = (id: string) => {
    const u = assignees.find((a) => a.id === id);
    return u ? `${u.first_name} ${u.last_name}` : "—";
  };
  const [form, setForm] = useState({
    title: mission.title,
    description: mission.description,
    priority: mission.priority,
    status: mission.status,
    assignee_id: mission.assignee_id,
    collaborators: mission.collaborators,
    project_id: mission.project_id,
    start_date: mission.start_date.slice(0, 10),
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
          <div className="sm:col-span-2">
            <Field label="Assigné à">
              <div className="flex flex-wrap gap-1.5 empty:hidden">
                {form.assignee_id && (
                  <PersonPill
                    name={nameOf(form.assignee_id)}
                    onRemove={() => {
                      const [next, ...rest] = form.collaborators;
                      setForm({ ...form, assignee_id: next ?? "", collaborators: rest });
                    }}
                  />
                )}
                {form.collaborators.map((id) => (
                  <PersonPill
                    key={id}
                    name={nameOf(id)}
                    onRemove={() =>
                      setForm({
                        ...form,
                        collaborators: form.collaborators.filter((c) => c !== id),
                      })
                    }
                  />
                ))}
              </div>
              <select
                className={`${selectClass} mt-2`}
                value=""
                onChange={(e) => {
                  const id = e.target.value;
                  if (!id) return;
                  setForm(
                    form.assignee_id
                      ? { ...form, collaborators: [...form.collaborators, id] }
                      : { ...form, assignee_id: id },
                  );
                }}
              >
                <option value="">+ Ajouter une personne…</option>
                {assignees
                  .filter((u) => u.id !== form.assignee_id && !form.collaborators.includes(u.id))
                  .map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.first_name} {u.last_name}
                    </option>
                  ))}
              </select>
            </Field>
          </div>
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
