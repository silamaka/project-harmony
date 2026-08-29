import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, X } from "lucide-react";
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
  type Client,
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
          <div className={lockAssignee ? "sm:col-span-2" : undefined}>
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
                maxLength={800}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
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
}: {
  role?: "collaborateur" | "chef_projet" | "admin" | "client";
  triggerLabel?: string;
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
    company_name: "",
    is_active: true,
    workload: 0,
    avatar_url: "",
  });
  const done = useCreate([["users"], ["collaborators"], ["clients"]], () => setOpen(false));

  const mutation = useMutation({
    mutationFn: async () => {
      const { password, company_name, ...rest } = form;
      let client_id: string | undefined;
      // Un utilisateur "Client" crée directement sa fiche entreprise : pas besoin
      // de passer d'abord par Clients > Nouveau client.
      if (form.role === "client" && company_name.trim()) {
        const client = await clientService.create({
          name: company_name.trim(),
          industry: "Non renseigné",
          email: form.email.trim(),
          phone: form.phone.trim(),
          status: "actif",
          logo_url: form.avatar_url,
        });
        client_id = client.id;
      }
      return userService.create({
        ...rest,
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        email: form.email.trim(),
        role: form.role,
        password,
        ...(client_id ? { client_id } : {}),
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
        company_name: "",
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
              <Field label="Nom de l'entreprise">
                <Input
                  value={form.company_name}
                  onChange={(e) => setForm({ ...form, company_name: e.target.value })}
                />
              </Field>
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
              (form.role === "client" && !form.company_name.trim()) ||
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
  const linkedClient = clients?.find((c) => c.id === user.client_id);
  const [open, setOpen] = useState(false);
  const buildForm = () => ({
    first_name: user.first_name,
    last_name: user.last_name,
    email: user.email,
    phone: user.phone ?? "",
    job_title: user.job_title ?? "",
    password: "",
    role: user.role,
    company_name: linkedClient?.name ?? "",
    company_industry: linkedClient?.industry ?? "",
    company_status: linkedClient?.status ?? ("actif" as Client["status"]),
    is_active: user.is_active,
    avatar_url: user.avatar_url ?? "",
  });
  const [form, setForm] = useState(buildForm);
  const done = useCreate([["users"], ["collaborators"], ["clients"]], () => setOpen(false));

  const mutation = useMutation({
    mutationFn: async () => {
      const { password: _password, company_name, company_industry, company_status, ...rest } = form;
      const patch: Partial<User> = { ...rest, role: form.role };
      // Un utilisateur "Client" crée/rattache directement sa fiche entreprise :
      // pas besoin de passer par une page dédiée.
      if (form.role === "client" && company_name.trim()) {
        const clientPatch = {
          name: company_name.trim(),
          industry: company_industry.trim() || "Non renseigné",
          status: company_status,
          logo_url: form.avatar_url,
        };
        if (user.client_id) {
          await clientService.update(user.client_id, clientPatch);
        } else {
          const client = await clientService.create({
            ...clientPatch,
            email: form.email.trim(),
            phone: form.phone.trim(),
          });
          patch.client_id = client.id;
        }
      }
      return userService.update(user.id, patch);
    },
    onSuccess: () => done("Utilisateur mis à jour."),
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
            <>
              <div className="sm:col-span-2">
                <Field label="Nom de l'entreprise">
                  <Input
                    value={form.company_name}
                    onChange={(e) => setForm({ ...form, company_name: e.target.value })}
                  />
                </Field>
              </div>
              <Field label="Secteur de l'entreprise">
                <Input
                  value={form.company_industry}
                  onChange={(e) => setForm({ ...form, company_industry: e.target.value })}
                />
              </Field>
              <Field label="Statut de l'entreprise">
                <select
                  className={selectClass}
                  value={form.company_status}
                  onChange={(e) =>
                    setForm({ ...form, company_status: e.target.value as Client["status"] })
                  }
                >
                  <option value="prospect">Prospect</option>
                  <option value="actif">Actif</option>
                  <option value="inactif">Inactif</option>
                </select>
              </Field>
            </>
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
          <Button disabled={mutation.isPending} onClick={() => mutation.mutate()}>
            {mutation.isPending ? "Enregistrement..." : "Enregistrer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
