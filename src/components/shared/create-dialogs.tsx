import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Link2, Plus, X } from "lucide-react";
import { useId, useMemo, useState } from "react";
import { Children, cloneElement, isValidElement } from "react";
import type { ReactElement, ReactNode } from "react";
import { toast } from "sonner";
import { AvatarPicker } from "@/components/shared/avatar";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/auth-context";
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
  TASK_TYPE_LABELS,
  type Client,
  type MissionSource,
  type MissionStatus,
  type Priority,
  type ProjectStatus,
  type Role,
  type TaskType,
  type User,
} from "@/types";
import { errorMessage } from "@/lib/api";
import { cn } from "@/lib/utils";

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
  // Le libellé désigne le premier élément (le champ), même suivi d'un message.
  let linked = false;
  const control = Children.map(children, (child) => {
    if (linked || !isValidElement(child)) return child;
    linked = true;
    return cloneElement(child as ReactElement<{ id?: string }>, { id });
  });
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

/** Liste éditable de liens titrés (brief client, Drive, Figma...), ajoutés un par un. */
function SourcesEditor({
  sources,
  onChange,
}: {
  sources: MissionSource[];
  onChange: (next: MissionSource[]) => void;
}) {
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  const add = () => {
    const value = url.trim();
    if (!value) return;
    onChange([...sources, { label: label.trim(), url: value }]);
    setLabel("");
    setUrl("");
  };
  return (
    <div className="space-y-2">
      {sources.length > 0 && (
        <ul className="space-y-1">
          {sources.map((s, i) => (
            <li
              key={`${s.url}-${i}`}
              className="flex items-center gap-2 rounded-md border border-input bg-background px-2.5 py-1.5 text-xs"
            >
              <Link2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">
                {s.label && <span className="font-medium">{s.label} — </span>}
                <span className="text-muted-foreground">{s.url}</span>
              </span>
              <button
                type="button"
                onClick={() => onChange(sources.filter((_, j) => j !== i))}
                aria-label="Retirer ce lien"
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-1.5">
        <Input
          value={label}
          placeholder="Titre (ex. Brief client)"
          onChange={(e) => setLabel(e.target.value)}
          className="w-36 shrink-0"
        />
        <Input
          value={url}
          placeholder="https://..."
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
        />
        <Button type="button" variant="outline" size="sm" onClick={add} disabled={!url.trim()}>
          Ajouter
        </Button>
      </div>
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
    onError: (error) => toast.error(errorMessage(error, "Création impossible.")),
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
  assigneeId,
  lockAssignee = false,
}: {
  projectId?: string;
  clientId?: string;
  /** Pré-sélectionne le responsable (ex. depuis la fiche d'un collaborateur). */
  assigneeId?: string;
  /** Masque le champ "Assigné à" : la mission reste assignée à `assigneeId`. */
  lockAssignee?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const { data: allProjects } = useQuery({ queryKey: ["projects"], queryFn: projectService.list });
  const projects = clientId
    ? (allProjects ?? []).filter((p) => p.client_id === clientId)
    : allProjects;
  const { data: users } = useQuery({ queryKey: ["users"], queryFn: userService.list });
  const assignees = (users ?? []).filter((u) => u.role !== "client");
  const nameOf = (id: string) => {
    const u = assignees.find((a) => a.id === id);
    return u ? `${u.first_name} ${u.last_name}` : "—";
  };
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    title: "",
    description: "",
    sources: [] as MissionSource[],
    task_type: "mission" as TaskType,
    priority: "normale" as Priority,
    status: "a_faire" as MissionStatus,
    project_id: projectId ?? "",
    assignee_id: assigneeId ?? "",
    collaborators: [] as string[],
    start_date: today,
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
    onError: (error) => toast.error(errorMessage(error, "Création impossible.")),
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
          <div>
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
              {lockAssignee && (projects ?? []).length === 0 && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Aucun projet disponible : vous devez déjà avoir une mission sur un projet pour en
                  créer une nouvelle.
                </p>
              )}
            </Field>
          </div>
          <Field label="Tâche">
            <select
              className={selectClass}
              value={form.task_type}
              onChange={(e) => setForm({ ...form, task_type: e.target.value as TaskType })}
            >
              {Object.entries(TASK_TYPE_LABELS)
                .filter(([v]) => v !== "livrable")
                .map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
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
                    onRemove={
                      lockAssignee
                        ? undefined
                        : () => {
                            const [next, ...rest] = form.collaborators;
                            setForm({ ...form, assignee_id: next ?? "", collaborators: rest });
                          }
                    }
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
                maxLength={2000}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="Sources">
              <SourcesEditor
                sources={form.sources}
                onChange={(sources) => setForm({ ...form, sources })}
              />
            </Field>
          </div>
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
  excludeRoles = [],
  clientId,
}: {
  role?: "collaborateur" | "chef_projet" | "admin" | "client";
  triggerLabel?: string;
  /** Rattache d'office un compte "client" à cette entreprise (ex. depuis sa fiche client). */
  clientId?: string;
  /** Limite le sélecteur au rôle fourni (aucun autre rôle proposé). */
  lockRole?: boolean;
  /** Masque ces rôles du sélecteur (ex. "collaborateur" quand ce rôle a déjà sa propre page de création dédiée). */
  excludeRoles?: ("collaborateur" | "chef_projet" | "admin" | "client")[];
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
    client_id: clientId ?? "",
    company_name: "",
    is_active: true,
    workload: 0,
    avatar_url: "",
  });
  const { data: clients } = useQuery({ queryKey: ["clients"], queryFn: clientService.list });
  const done = useCreate([["users"], ["collaborators"], ["clients"]], () => setOpen(false));

  const mutation = useMutation({
    mutationFn: () => {
      const { client_id, company_name, ...rest } = form;
      // Compte "Client" : entreprise fixée par le contexte (fiche client), ou
      // saisie par son nom. Le serveur la rattache si elle existe déjà (même
      // nom), la crée sinon.
      return userService.create({
        ...rest,
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        email: form.email.trim(),
        role: form.role,
        ...(form.role === "client"
          ? clientId
            ? { client_id }
            : { company_name: company_name.trim() }
          : {}),
      });
    },
    onSuccess: () => {
      done(
        form.role === "client"
          ? "Accès créé. Transmettez l'e-mail et le mot de passe au client."
          : "Utilisateur ajouté.",
      );
      setForm({
        first_name: "",
        last_name: "",
        email: "",
        phone: "",
        job_title: "",
        password: "",
        role,
        client_id: clientId ?? "",
        company_name: "",
        is_active: true,
        workload: 0,
        avatar_url: "",
      });
    },
    onError: (error) => toast.error(errorMessage(error, "Ajout impossible.")),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="mr-1 h-4 w-4" /> {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent onEscapeKeyDown={keepOpenForOpenList}>
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
          <Field label="Poste/Secteur">
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
                Object.entries(ROLE_OPTIONS)
                  .filter(([v]) => !excludeRoles.includes(v as typeof role))
                  .map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))
              )}
            </select>
          </Field>
          {form.role === "client" && (
            <div className="sm:col-span-2">
              <CompanyNameField
                // Depuis la fiche client : l'entreprise est fixée d'office.
                value={
                  clientId
                    ? (clients?.find((c) => c.id === clientId)?.name ?? "")
                    : form.company_name
                }
                disabled={!!clientId}
                onChange={(company_name) => setForm({ ...form, company_name })}
              />
            </div>
          )}
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
              (form.role === "client" &&
                (clientId ? !form.client_id : !form.company_name.trim())) ||
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
  const { user: currentUser } = useAuth();
  const isSelf = user.id === currentUser?.id;
  const { data: clients } = useQuery({ queryKey: ["clients"], queryFn: clientService.list });
  const [open, setOpen] = useState(false);
  const buildForm = () => ({
    first_name: user.first_name,
    last_name: user.last_name,
    email: user.email,
    phone: user.phone ?? "",
    job_title: user.job_title ?? "",
    password: "",
    role: user.role,
    // null = entreprise inchangée ; sinon le nom tapé (rattachée ou créée).
    company_name: null as string | null,
    is_active: user.is_active,
    avatar_url: user.avatar_url ?? "",
  });
  const [form, setForm] = useState(buildForm);
  const done = useCreate([["users"], ["collaborators"], ["clients"]], () => setOpen(false));
  const currentCompany = clients?.find((c) => c.id === user.client_id)?.name ?? "";
  const companyValue = form.company_name ?? currentCompany;

  const mutation = useMutation({
    mutationFn: () => {
      const { password, company_name, ...rest } = form;
      // Changer le nom rattache le compte à une autre entreprise (existante
      // ou créée) ; l'entreprise elle-même se renomme depuis sa fiche client.
      const changed = company_name !== null && company_name.trim() !== currentCompany;
      return userService.update(user.id, {
        ...rest,
        role: form.role,
        ...(form.role === "client" && changed ? { company_name: company_name.trim() } : {}),
        // Vide = inchangé ; sinon l'admin redonne un mot de passe au compte.
        ...(password.trim() ? { password: password.trim() } : {}),
      });
    },
    onSuccess: () =>
      done(
        form.password.trim()
          ? "Utilisateur mis à jour. Transmettez-lui son nouveau mot de passe."
          : "Utilisateur mis à jour.",
      ),
    onError: (error) => toast.error(errorMessage(error, "Mise à jour impossible.")),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        // Recalcule les champs entreprise à l'ouverture : la requête "clients"
        // peut ne pas être encore résolue au tout premier rendu du composant.
        if (o) setForm(buildForm());
        setOpen(o);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Modifier
        </Button>
      </DialogTrigger>
      <DialogContent onEscapeKeyDown={keepOpenForOpenList}>
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
          <Field label="Poste/Secteur">
            <Input
              value={form.job_title}
              onChange={(e) => setForm({ ...form, job_title: e.target.value })}
            />
          </Field>
          <Field label="Rôle">
            <select
              className={selectClass}
              value={form.role}
              disabled={currentUser?.role !== "admin"}
              title={
                currentUser?.role !== "admin"
                  ? "Seul un administrateur peut changer un rôle."
                  : undefined
              }
              onChange={(e) => setForm({ ...form, role: e.target.value as Role })}
            >
              {Object.entries(ROLE_OPTIONS).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </Field>
          {form.role === "client" && (
            <div className="sm:col-span-2">
              <CompanyNameField
                value={companyValue}
                onChange={(company_name) => setForm({ ...form, company_name })}
              />
            </div>
          )}
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
              disabled={isSelf}
              title={isSelf ? "Vous ne pouvez pas désactiver votre propre compte." : undefined}
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
              mutation.isPending ||
              (form.role === "client" && !companyValue.trim()) ||
              (form.password.trim().length > 0 && form.password.trim().length < 4)
            }
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? "Enregistrement..." : "Enregistrer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Échap dans une liste ouverte (champ Entreprise) la ferme, pas tout le
 * formulaire : la fenêtre écoute Échap avant le champ. */
function keepOpenForOpenList(e: KeyboardEvent) {
  if ((e.target as HTMLElement | null)?.getAttribute?.("aria-expanded") === "true") {
    e.preventDefault();
  }
}

/** Comparaison sans accents ni majuscules ("atlas" trouve "Atlas Retail"). */
const foldName = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();

/** Distance d'édition (fautes de frappe) entre deux noms, bornée à 3. */
function typoDistance(a: string, b: string) {
  if (Math.abs(a.length - b.length) > 3) return 4;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(
        prev[j]! + 1,
        cur[j - 1]! + 1,
        prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = cur;
  }
  return prev[b.length]!;
}

/** Entreprise d'un compte "client" : recherche dans les entreprises
 * enregistrées, ou création volontaire d'une nouvelle (« ＋ Créer »). La
 * valeur reste le nom : le serveur rattache l'entreprise de même nom (sans
 * tenir compte de la casse) ou la crée. Un nom proche d'une entreprise
 * existante (faute de frappe) est signalé avant de créer un doublon. */
function CompanyNameField({
  value,
  onChange,
  disabled = false,
}: {
  value: string;
  onChange: (name: string) => void;
  disabled?: boolean;
}) {
  const { data: clients } = useQuery({ queryKey: ["clients"], queryFn: clientService.list });
  const { data: users } = useQuery({ queryKey: ["users"], queryFn: userService.list });
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  const companies = useMemo(
    () => [...(clients ?? [])].sort((a, b) => a.name.localeCompare(b.name)),
    [clients],
  );
  const accounts = (id: string) =>
    (users ?? []).filter((u) => u.role === "client" && u.client_id === id).length;
  const typed = foldName(value);
  const exact = companies.find((c) => foldName(c.name) === typed);
  const matches = typed ? companies.filter((c) => foldName(c.name).includes(typed)) : companies;
  // Nom proche d'une entreprise existante, sans en être une : faute probable.
  const similar =
    typed && !exact ? companies.find((c) => typoDistance(foldName(c.name), typed) <= 2) : undefined;
  const canCreate = typed.length > 0 && !exact;
  // Le nom proche passe en tête, avant « Créer » : l'option la plus visible ne
  // doit jamais être celle qui crée un doublon par faute de frappe.
  const options = [
    ...(similar && !matches.includes(similar)
      ? [{ kind: "similar" as const, name: similar.name, id: similar.id }]
      : []),
    ...matches.map((c) => ({ kind: "existing" as const, name: c.name, id: c.id })),
    ...(canCreate ? [{ kind: "create" as const, name: value.trim(), id: "" }] : []),
  ];

  const choose = (name: string) => {
    onChange(name);
    setOpen(false);
  };

  return (
    <Field label="Entreprise">
      <div className="relative">
        <Input
          name="olympe-company"
          autoComplete="off"
          role="combobox"
          aria-expanded={open && !disabled && options.length > 0}
          placeholder="Rechercher ou créer une entreprise"
          value={value}
          disabled={disabled}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 150)}
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (!open || options.length === 0) return;
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((i) => (i + 1) % options.length);
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((i) => (i - 1 + options.length) % options.length);
            } else if (e.key === "Enter") {
              e.preventDefault();
              choose(options[active]!.name);
            } else if (e.key === "Escape") {
              setOpen(false);
            }
          }}
        />
        {open && !disabled && options.length > 0 && (
          <ul
            role="listbox"
            className="absolute left-0 right-0 top-full z-30 mt-1 max-h-56 overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-lg"
          >
            {options.map((o, i) => (
              <li key={o.kind + o.id + o.name} role="option" aria-selected={i === active}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => choose(o.name)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm",
                    i === active ? "bg-accent text-accent-foreground" : "hover:bg-accent/60",
                    o.kind === "create" && "border-t border-border font-medium text-primary",
                  )}
                >
                  {o.kind !== "create" ? (
                    <>
                      <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate">{o.name}</span>
                      {o.kind === "similar" && (
                        <span className="shrink-0 rounded-full bg-warning/15 px-1.5 text-[10px] font-medium text-warning">
                          nom proche
                        </span>
                      )}
                      <span className="shrink-0 text-[11px] text-muted-foreground">
                        {accounts(o.id)} compte{accounts(o.id) > 1 ? "s" : ""}
                      </span>
                    </>
                  ) : (
                    <>
                      <Plus className="h-4 w-4 shrink-0" />
                      <span className="min-w-0 flex-1 truncate">Créer « {o.name} »</span>
                    </>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {!disabled && typed && (
        <p className="mt-1 text-xs">
          {exact ? (
            <span className="text-success">Entreprise existante : le compte y sera rattaché.</span>
          ) : similar ? (
            <span className="text-warning">
              Nouvelle entreprise. Vouliez-vous dire{" "}
              <button
                type="button"
                className="font-semibold underline"
                onClick={() => choose(similar.name)}
              >
                {similar.name}
              </button>{" "}
              ?
            </span>
          ) : (
            <span className="text-muted-foreground">
              Nouvelle entreprise : elle sera créée avec ce compte.
            </span>
          )}
        </p>
      )}
    </Field>
  );
}
