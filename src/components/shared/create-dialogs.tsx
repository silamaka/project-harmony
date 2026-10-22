import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link2, Plus, X } from "lucide-react";
import { useId, useState } from "react";
import { cloneElement, isValidElement } from "react";
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
  allowedProjectIds,
  lockAssignee = false,
}: {
  projectId?: string;
  clientId?: string;
  /** Pré-sélectionne le responsable (ex. depuis la fiche d'un collaborateur). */
  assigneeId?: string;
  /** Restreint le sélecteur de projet à cette liste (ex. auto-création par un collaborateur). */
  allowedProjectIds?: string[];
  /** Masque le champ "Assigné à" : la mission reste assignée à `assigneeId`. */
  lockAssignee?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const { data: allProjects } = useQuery({ queryKey: ["projects"], queryFn: projectService.list });
  const projects = allowedProjectIds
    ? (allProjects ?? []).filter((p) => allowedProjectIds.includes(p.id))
    : clientId
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
    is_active: true,
    workload: 0,
    avatar_url: "",
  });
  const { data: clients } = useQuery({ queryKey: ["clients"], queryFn: clientService.list });
  const done = useCreate([["users"], ["collaborators"], ["clients"]], () => setOpen(false));

  const mutation = useMutation({
    mutationFn: () => {
      const { client_id, ...rest } = form;
      // Un compte "Client" est toujours rattaché à une entreprise existante
      // (jamais créée ici) : une entreprise peut avoir plusieurs contacts, et
      // en recréer une donnerait au client un portail vide (doublon).
      return userService.create({
        ...rest,
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        email: form.email.trim(),
        role: form.role,
        ...(form.role === "client" ? { client_id } : {}),
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
              <CompanyField
                value={form.client_id}
                locked={!!clientId}
                clients={clients ?? []}
                onChange={(client_id) => setForm({ ...form, client_id })}
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
              (form.role === "client" && !form.client_id) ||
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
    client_id: user.client_id ?? "",
    is_active: user.is_active,
    avatar_url: user.avatar_url ?? "",
  });
  const [form, setForm] = useState(buildForm);
  const done = useCreate([["users"], ["collaborators"], ["clients"]], () => setOpen(false));

  const mutation = useMutation({
    mutationFn: () => {
      const { password, client_id, ...rest } = form;
      // L'entreprise se modifie depuis sa fiche client, jamais ici : un
      // contact ne renomme pas son entreprise (qui peut en avoir d'autres).
      return userService.update(user.id, {
        ...rest,
        role: form.role,
        ...(form.role === "client" ? { client_id } : {}),
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
              <CompanyField
                value={form.client_id}
                clients={clients ?? []}
                onChange={(client_id) => setForm({ ...form, client_id })}
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
              (form.role === "client" && !form.client_id) ||
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

/** Entreprise d'un compte "client" : toujours une fiche existante (jamais
 * créée ici, pour éviter les doublons). `locked` : fixée par le contexte
 * (ex. "Créer un accès" depuis la fiche client). */
function CompanyField({
  value,
  clients,
  onChange,
  locked = false,
}: {
  value: string;
  clients: Client[];
  onChange: (clientId: string) => void;
  locked?: boolean;
}) {
  return (
    <Field label="Entreprise">
      <select
        className={selectClass}
        value={value}
        disabled={locked}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">Sélectionner une entreprise…</option>
        {[...clients]
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
      </select>
      {!locked && (
        <p className="mt-1 text-xs text-muted-foreground">
          Entreprise absente de la liste ? Créez-la d'abord dans Clients.
        </p>
      )}
    </Field>
  );
}
