import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useId, useState } from "react";
import { cloneElement, isValidElement } from "react";
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
  type MissionStatus,
  type Priority,
  type ProjectStatus,
  type Role,
  type User,
} from "@/types";

const selectClass =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

const ROLE_OPTIONS: Record<"collaborateur" | "chef_projet" | "admin" | "client", string> = {
  collaborateur: "Collaborateur",
  chef_projet: "Chef de projet",
  admin: "Administrateur",
  client: "Client",
};

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

function useCreate(keys: string[][], onDone: () => void) {
  const qc = useQueryClient();
  return (message: string) => {
    keys.forEach((key) => void qc.invalidateQueries({ queryKey: key }));
    toast.success(message);
    onDone();
  };
}

/* --------------------------------- Client --------------------------------- */
export function CreateClientDialog() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: "",
    industry: "",
    email: "",
    phone: "",
    status: "prospect",
  });
  const done = useCreate([["clients"]], () => setOpen(false));

  const mutation = useMutation({
    mutationFn: () =>
      clientService.create({
        name: form.name.trim(),
        industry: form.industry.trim() || "Non renseigné",
        email: form.email.trim(),
        phone: form.phone.trim(),
        status: form.status as "actif" | "inactif" | "prospect",
      }),
    onSuccess: () => {
      done("Client créé.");
      setForm({ name: "", industry: "", email: "", phone: "", status: "prospect" });
    },
    onError: () => toast.error("Création impossible."),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="mr-1 h-4 w-4" /> Nouveau client
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nouveau client</DialogTitle>
          <DialogDescription>Ajoutez un compte au portefeuille de l'agence.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Nom">
            <Input
              value={form.name}
              maxLength={120}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </Field>
          <Field label="Secteur">
            <Input
              value={form.industry}
              maxLength={80}
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
          <Field label="Statut">
            <select
              className={selectClass}
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value })}
            >
              <option value="prospect">Prospect</option>
              <option value="actif">Actif</option>
              <option value="inactif">Inactif</option>
            </select>
          </Field>
        </div>
        <DialogFooter>
          <Button
            disabled={!form.name.trim() || !form.email.trim() || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? "Création..." : "Créer le client"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* --------------------------------- Projet --------------------------------- */
export function CreateProjectDialog({ clientId }: { clientId?: string }) {
  const [open, setOpen] = useState(false);
  const { data: clients } = useQuery({ queryKey: ["clients"], queryFn: clientService.list });
  const { data: users } = useQuery({ queryKey: ["users"], queryFn: userService.list });
  const managers = (users ?? []).filter((u) => u.role === "chef_projet" || u.role === "admin");
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    name: "",
    description: "",
    client_id: clientId ?? "",
    owner_id: "",
    start_date: today,
    end_date: today,
    status: "en_preparation" as ProjectStatus,
    progress: 0,
  });
  const done = useCreate([["projects"], ["clients"]], () => setOpen(false));

  const mutation = useMutation({
    mutationFn: () =>
      projectService.create({
        ...form,
        name: form.name.trim(),
        client_id: form.client_id || clients?.[0]?.id || "",
        owner_id: form.owner_id || managers[0]?.id || "",
      }),
    onSuccess: () => done("Projet créé."),
    onError: () => toast.error("Création impossible."),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="mr-1 h-4 w-4" /> Nouveau projet
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nouveau projet</DialogTitle>
          <DialogDescription>Créez un projet et assignez un chef de projet.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Nom du projet">
            <Input
              value={form.name}
              maxLength={120}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </Field>
          <Field label="Client">
            <select
              className={selectClass}
              value={form.client_id}
              onChange={(e) => setForm({ ...form, client_id: e.target.value })}
            >
              <option value="">Sélectionner…</option>
              {(clients ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Chef de projet">
            <select
              className={selectClass}
              value={form.owner_id}
              onChange={(e) => setForm({ ...form, owner_id: e.target.value })}
            >
              <option value="">Sélectionner…</option>
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
            disabled={!form.name.trim() || !form.client_id || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? "Création..." : "Créer le projet"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* -------------------------------- Mission --------------------------------- */
export function CreateMissionDialog({
  projectId,
  clientId,
}: {
  projectId?: string;
  clientId?: string;
}) {
  const [open, setOpen] = useState(false);
  const { data: allProjects } = useQuery({ queryKey: ["projects"], queryFn: projectService.list });
  const projects = clientId
    ? (allProjects ?? []).filter((p) => p.client_id === clientId)
    : allProjects;
  const { data: users } = useQuery({ queryKey: ["users"], queryFn: userService.list });
  const assignees = (users ?? []).filter((u) => u.role !== "client");
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    title: "",
    description: "",
    objective: "",
    strategy: "",
    resources: "",
    priority: "normale" as Priority,
    status: "a_faire" as MissionStatus,
    project_id: projectId ?? "",
    assignee_id: "",
    deadline: today,
  });
  const done = useCreate([["missions"], ["notifications"]], () => setOpen(false));

  const mutation = useMutation({
    mutationFn: () => {
      const project = (projects ?? []).find((p) => p.id === form.project_id);
      return missionService.create({
        ...form,
        title: form.title.trim(),
        project_id: project?.id ?? "",
        client_id: project?.client_id ?? "",
        assignee_id: form.assignee_id || assignees[0]?.id || "",
      });
    },
    onSuccess: () => done("Mission créée."),
    onError: () => toast.error("Création impossible."),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="mr-1 h-4 w-4" /> Nouvelle mission
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nouvelle mission</DialogTitle>
          <DialogDescription>Brief, priorité, assignation et échéance.</DialogDescription>
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
              <option value="">Sélectionner…</option>
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
              <option value="">Sélectionner…</option>
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
          <Field label="Ressources">
            <Input
              value={form.resources}
              onChange={(e) => setForm({ ...form, resources: e.target.value })}
            />
          </Field>
        </div>
        <DialogFooter>
          <Button
            disabled={!form.title.trim() || !form.project_id || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? "Création..." : "Créer la mission"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------ Collaborateur ------------------------------ */
export function CreateUserDialog({
  role = "collaborateur",
  triggerLabel = "Ajouter",
  lockRole = false,
}: {
  role?: "collaborateur" | "chef_projet" | "admin" | "client";
  triggerLabel?: string;
  /** Limite le sélecteur au rôle fourni (aucun autre rôle proposé). */
  lockRole?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    job_title: "",
    password: "",
    role,
    is_active: true,
    workload: 0,
    avatar_url: "",
  });
  const done = useCreate([["users"], ["collaborators"]], () => setOpen(false));

  const mutation = useMutation({
    mutationFn: () => {
      const { password: _password, ...rest } = form;
      return userService.create({
        ...rest,
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        email: form.email.trim(),
        role: form.role,
      });
    },
    onSuccess: () => {
      done("Utilisateur ajouté.");
      setForm({
        first_name: "",
        last_name: "",
        email: "",
        phone: "",
        job_title: "",
        password: "",
        role,
        is_active: true,
        workload: 0,
        avatar_url: "",
      });
    },
    onError: () => toast.error("Ajout impossible."),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="mr-1 h-4 w-4" /> {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{triggerLabel}</DialogTitle>
          <DialogDescription>Créez un accès à la plateforme.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label="Photo de profil">
              <AvatarPicker
                value={form.avatar_url}
                onChange={(avatar_url) => setForm({ ...form, avatar_url })}
                fallbackInitials={`${form.first_name[0] ?? ""}${form.last_name[0] ?? ""}`}
              />
            </Field>
          </div>
          <Field label="Prénom">
            <Input
              value={form.first_name}
              onChange={(e) => setForm({ ...form, first_name: e.target.value })}
            />
          </Field>
          <Field label="Nom">
            <Input
              value={form.last_name}
              onChange={(e) => setForm({ ...form, last_name: e.target.value })}
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
          <Field label="Poste">
            <Input
              value={form.job_title}
              onChange={(e) => setForm({ ...form, job_title: e.target.value })}
            />
          </Field>
          <Field label="Rôle">
            <select
              className={selectClass}
              value={form.role}
              disabled={lockRole}
              onChange={(e) => setForm({ ...form, role: e.target.value as typeof role })}
            >
              {lockRole ? (
                <option value={role}>{ROLE_OPTIONS[role]}</option>
              ) : (
                Object.entries(ROLE_OPTIONS).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))
              )}
            </select>
          </Field>
          <Field label="Mot de passe">
            <Input
              type="password"
              autoComplete="new-password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
          </Field>
          <Field label="Statut">
            <select
              className={selectClass}
              value={form.is_active ? "1" : "0"}
              onChange={(e) => setForm({ ...form, is_active: e.target.value === "1" })}
            >
              <option value="1">Actif</option>
              <option value="0">Inactif</option>
            </select>
          </Field>
        </div>
        <DialogFooter>
          <Button
            disabled={
              !form.first_name.trim() ||
              !form.email.trim() ||
              form.password.trim().length < 4 ||
              mutation.isPending
            }
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? "Ajout..." : "Ajouter"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ----------------------------- Édition utilisateur (admin) ---------------- */
export function EditUserDialog({ user }: { user: User }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    first_name: user.first_name,
    last_name: user.last_name,
    email: user.email,
    phone: user.phone ?? "",
    job_title: user.job_title ?? "",
    password: "",
    role: user.role,
    is_active: user.is_active,
    avatar_url: user.avatar_url ?? "",
  });
  const done = useCreate([["users"], ["collaborators"]], () => setOpen(false));

  const mutation = useMutation({
    mutationFn: () => {
      const { password: _password, ...rest } = form;
      return userService.update(user.id, { ...rest, role: form.role });
    },
    onSuccess: () => done("Utilisateur mis à jour."),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Modifier
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Modifier l'utilisateur</DialogTitle>
          <DialogDescription>
            Seul un administrateur peut modifier ces informations.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label="Photo de profil">
              <AvatarPicker
                value={form.avatar_url}
                onChange={(avatar_url) => setForm({ ...form, avatar_url })}
                fallbackInitials={`${form.first_name[0] ?? ""}${form.last_name[0] ?? ""}`}
              />
            </Field>
          </div>
          <Field label="Prénom">
            <Input
              value={form.first_name}
              onChange={(e) => setForm({ ...form, first_name: e.target.value })}
            />
          </Field>
          <Field label="Nom">
            <Input
              value={form.last_name}
              onChange={(e) => setForm({ ...form, last_name: e.target.value })}
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
          <Field label="Poste">
            <Input
              value={form.job_title}
              onChange={(e) => setForm({ ...form, job_title: e.target.value })}
            />
          </Field>
          <Field label="Rôle">
            <select
              className={selectClass}
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value as Role })}
            >
              {Object.entries(ROLE_OPTIONS).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
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
              value={form.is_active ? "1" : "0"}
              onChange={(e) => setForm({ ...form, is_active: e.target.value === "1" })}
            >
              <option value="1">Actif</option>
              <option value="0">Inactif</option>
            </select>
          </Field>
        </div>
        <DialogFooter>
          <Button disabled={mutation.isPending} onClick={() => mutation.mutate()}>
            {mutation.isPending ? "Enregistrement..." : "Enregistrer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
