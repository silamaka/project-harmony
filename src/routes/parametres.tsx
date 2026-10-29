import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Briefcase, Building2, Search, ShieldCheck, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/app-shell";
import { CreateUserDialog, EditUserDialog } from "@/components/shared/create-dialogs";
import { ConfirmDeleteButton } from "@/components/shared/edit-dialogs";
import { PillSelect } from "@/components/shared/pill-select";
import { StatCard } from "@/components/shared/stat-card";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/context/auth-context";
import { clientService, missionService, projectService, userService } from "@/services";
import { ROLE_LABELS, type Role, type User } from "@/types";
import { errorMessage } from "@/lib/api";

const ROLE_FILTERS = ["tous", "admin", "chef_projet", "collaborateur", "client"] as const;
const STATUS_FILTERS = ["tous", "actif", "inactif"] as const;
const SORTS = ["recent", "ancien", "nom"] as const;
const SORT_LABELS: Record<(typeof SORTS)[number], string> = {
  recent: "Inscription récente",
  ancien: "Inscription ancienne",
  nom: "Nom A-Z",
};
const PAGE_SIZES = [10, 20, 50] as const;
const SELECT_CLASS =
  "h-9 w-full min-w-0 rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring sm:w-auto sm:px-3";

const ACTIVE_OPTIONS: Record<"1" | "0", string> = { "1": "Actif", "0": "Inactif" };
const ACTIVE_TONE: Record<"1" | "0", string> = {
  "1": "bg-success/15 text-success",
  "0": "bg-muted text-muted-foreground",
};

export const Route = createFileRoute("/parametres")({
  head: () => ({
    meta: [
      { title: "Paramètres — OLYMPE" },
      {
        name: "description",
        content: "Administration : gestion des utilisateurs, rôles et statuts de compte.",
      },
      { property: "og:title", content: "Paramètres — OLYMPE" },
      {
        property: "og:description",
        content: "Gestion des utilisateurs et des rôles de la plateforme.",
      },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const qc = useQueryClient();
  const { user: currentUser } = useAuth();
  const { data: users } = useQuery({ queryKey: ["users"], queryFn: userService.list });
  const { data: clients } = useQuery({ queryKey: ["clients"], queryFn: clientService.list });
  const { data: projects } = useQuery({ queryKey: ["projects"], queryFn: projectService.list });
  const { data: missions } = useQuery({ queryKey: ["missions"], queryFn: missionService.list });
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<(typeof ROLE_FILTERS)[number]>("tous");
  const [companyFilter, setCompanyFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_FILTERS)[number]>("tous");
  const [sort, setSort] = useState<(typeof SORTS)[number]>("recent");
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZES)[number]>(20);
  const [page, setPage] = useState(1);

  const removeUser = useMutation({
    mutationFn: (id: string) => userService.remove(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["users"] });
      void qc.invalidateQueries({ queryKey: ["collaborators"] });
      void qc.invalidateQueries({ queryKey: ["clients"] });
      toast.success("Utilisateur supprimé.");
    },
    onError: (error) => toast.error(errorMessage(error, "Suppression impossible.")),
  });

  const updateActive = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) =>
      userService.update(id, { is_active }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["users"] });
      void qc.invalidateQueries({ queryKey: ["collaborators"] });
      toast.success("Statut mis à jour.");
    },
    onError: (error) => toast.error(errorMessage(error, "Mise à jour impossible.")),
  });

  const stats = useMemo(
    () => ({
      clients: (users ?? []).filter((u) => u.role === "client").length,
      admins: (users ?? []).filter((u) => u.role === "admin").length,
      staff: (users ?? []).filter((u) => u.role === "chef_projet").length,
      collaborateurs: (users ?? []).filter((u) => u.role === "collaborateur").length,
    }),
    [users],
  );

  const filtered = useMemo(() => {
    const list = (users ?? []).filter(
      (u) =>
        (roleFilter === "tous" || u.role === roleFilter) &&
        (!companyFilter || u.client_id === companyFilter) &&
        (statusFilter === "tous" || (statusFilter === "actif" ? u.is_active : !u.is_active)) &&
        `${u.first_name} ${u.last_name} ${u.email}`.toLowerCase().includes(query.toLowerCase()),
    );
    return [...list].sort((a, b) => {
      if (sort === "nom")
        return `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`);
      const diff = new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      return sort === "recent" ? diff : -diff;
    });
  }, [users, query, roleFilter, companyFilter, statusFilter, sort]);

  // Même règle que le serveur (UserViewSet.destroy) : l'entreprise part avec
  // son dernier compte si elle n'a ni projet ni mission.
  const deleteDescription = (u: User) => {
    const base = "Le compte utilisateur sera définitivement supprimé.";
    const company = u.client_id ? clients?.find((c) => c.id === u.client_id) : undefined;
    const companyEmpty =
      company &&
      !(users ?? []).some((o) => o.id !== u.id && o.client_id === company.id) &&
      !(projects ?? []).some((p) => p.client_id === company.id) &&
      !(missions ?? []).some((m) => m.client_id === company.id);
    return companyEmpty
      ? `${base} L'entreprise ${company.name}, qui n'a plus aucun compte ni projet, sera aussi supprimée. Cette action est irréversible.`
      : `${base} Cette action est irréversible.`;
  };

  const companyName = (u: User) =>
    u.client_id ? clients?.find((c) => c.id === u.client_id)?.name : undefined;

  // Partagés par le tableau (desktop) et les cartes (mobile).
  const statusControl = (u: User) =>
    u.id === currentUser?.id ? (
      <span
        title="Vous ne pouvez pas désactiver votre propre compte."
        className="rounded-full bg-success/15 px-2.5 py-0.5 text-xs font-semibold text-success"
      >
        Actif
      </span>
    ) : (
      <PillSelect
        value={u.is_active ? "1" : "0"}
        options={ACTIVE_OPTIONS}
        tone={ACTIVE_TONE}
        onChange={(v) => updateActive.mutate({ id: u.id, is_active: v === "1" })}
      />
    );
  const rowActions = (u: User) => (
    <div className="flex items-center justify-end gap-2">
      <EditUserDialog user={u} />
      {u.id !== currentUser?.id && (
        <ConfirmDeleteButton
          iconOnly
          title={`Supprimer ${u.first_name} ${u.last_name} ?`}
          description={deleteDescription(u)}
          pending={removeUser.isPending && removeUser.variables === u.id}
          onConfirm={() => removeUser.mutate(u.id)}
        />
      )}
    </div>
  );

  // Carte de statistique : filtre la liste par rôle, un second clic le retire.
  const toggleRole = (r: Role) => updateFilter(setRoleFilter)(roleFilter === r ? "tous" : r);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pageItems = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const updateFilter =
    <T,>(setter: (v: T) => void) =>
    (v: T) => {
      setter(v);
      setPage(1);
    };

  return (
    <AppShell title="Paramètres" subtitle="Administration de la plateforme" allow={["admin"]}>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Clients"
          value={stats.clients}
          icon={Building2}
          active={roleFilter === "client"}
          onClick={() => toggleRole("client")}
        />
        <StatCard
          label="Admins"
          value={stats.admins}
          icon={ShieldCheck}
          tone="info"
          active={roleFilter === "admin"}
          onClick={() => toggleRole("admin")}
        />
        <StatCard
          label="Chefs de projet"
          value={stats.staff}
          icon={Briefcase}
          tone="warning"
          active={roleFilter === "chef_projet"}
          onClick={() => toggleRole("chef_projet")}
        />
        <StatCard
          label="Collaborateurs"
          value={stats.collaborateurs}
          icon={Users}
          tone="success"
          active={roleFilter === "collaborateur"}
          onClick={() => toggleRole("collaborateur")}
        />
      </div>

      <div className="surface-card mt-4 p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold">Gestion des utilisateurs</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Filtrez, modifiez les rôles et gérez la sécurité des comptes de tous les utilisateurs.
            </p>
          </div>
          {/* Le Dialog ne rend aucun élément : le bouton déclencheur est l'enfant direct. */}
          <div className="[&>button]:w-full sm:[&>button]:w-auto">
            <CreateUserDialog
              triggerLabel="Inviter un utilisateur"
              role="chef_projet"
              excludeRoles={["collaborateur"]}
            />
          </div>
        </div>

        {/* Mobile : recherche pleine largeur puis rôle / statut / tri sur une ligne. */}
        <div className="mt-4 grid grid-cols-3 gap-2 sm:flex sm:flex-wrap sm:items-center">
          <div className="relative col-span-3 sm:min-w-48 sm:flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Rechercher utilisateur..."
              value={query}
              onChange={(e) => updateFilter(setQuery)(e.target.value)}
              className="pl-9"
            />
          </div>
          <select
            className={SELECT_CLASS}
            value={roleFilter}
            onChange={(e) =>
              updateFilter(setRoleFilter)(e.target.value as (typeof ROLE_FILTERS)[number])
            }
          >
            <option value="tous">Tous les rôles</option>
            {ROLE_FILTERS.filter((r) => r !== "tous").map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r as Role]}
              </option>
            ))}
          </select>
          {/* Entreprise : les comptes clients d'une même entreprise. */}
          <select
            aria-label="Filtrer par entreprise"
            className={`${SELECT_CLASS} col-span-3 sm:col-span-1`}
            value={companyFilter}
            onChange={(e) => updateFilter(setCompanyFilter)(e.target.value)}
          >
            <option value="">Toutes les entreprises</option>
            {[...(clients ?? [])]
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </select>
          <select
            className={SELECT_CLASS}
            value={statusFilter}
            onChange={(e) =>
              updateFilter(setStatusFilter)(e.target.value as (typeof STATUS_FILTERS)[number])
            }
          >
            <option value="tous">Tous</option>
            <option value="actif">Actif</option>
            <option value="inactif">Inactif</option>
          </select>
          <select
            className={SELECT_CLASS}
            value={sort}
            onChange={(e) => setSort(e.target.value as (typeof SORTS)[number])}
          >
            {SORTS.map((s) => (
              <option key={s} value={s}>
                {SORT_LABELS[s]}
              </option>
            ))}
          </select>
          {/* Masqué sur mobile : la pagination suffit. */}
          <select
            className={`${SELECT_CLASS} hidden sm:block`}
            value={pageSize}
            onChange={(e) =>
              updateFilter(setPageSize)(Number(e.target.value) as (typeof PAGE_SIZES)[number])
            }
          >
            {PAGE_SIZES.map((n) => (
              <option key={n} value={n}>
                {n} / page
              </option>
            ))}
          </select>
        </div>

        {/* Mobile : une carte par utilisateur, toutes les actions visibles. */}
        <div className="mt-4 space-y-2 md:hidden">
          {pageItems.map((u) => (
            <div key={u.id} className="rounded-lg border border-border p-3">
              <p className="font-medium">
                {u.first_name} {u.last_name}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {[u.email, companyName(u)].filter(Boolean).join(" · ")}
              </p>
              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-accent px-2.5 py-0.5 text-xs font-medium text-accent-foreground">
                  {ROLE_LABELS[u.role]}
                </span>
                {statusControl(u)}
                <div className="ml-auto">{rowActions(u)}</div>
              </div>
            </div>
          ))}
          {pageItems.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Aucun utilisateur ne correspond à ces filtres.
            </p>
          )}
        </div>

        <div className="mt-4 hidden overflow-x-auto md:block">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                <th className="py-2 font-medium">Nom</th>
                <th className="py-2 font-medium">Email</th>
                <th className="py-2 font-medium">Rôle</th>
                <th className="py-2 font-medium">Entreprise</th>
                <th className="py-2 font-medium">Statut</th>
                <th className="py-2 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map((u) => (
                <tr key={u.id} className="border-b border-border/60 last:border-0">
                  <td className="py-2.5 font-medium">
                    {u.first_name} {u.last_name}
                  </td>
                  <td className="py-2.5 text-muted-foreground">{u.email}</td>
                  <td className="py-2.5">{ROLE_LABELS[u.role]}</td>
                  <td className="py-2.5 text-muted-foreground">{companyName(u) ?? "—"}</td>
                  <td className="py-2.5">{statusControl(u)}</td>
                  <td className="py-2.5 text-right">{rowActions(u)}</td>
                </tr>
              ))}
              {pageItems.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                    Aucun utilisateur ne correspond à ces filtres.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {filtered.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
            <p>
              {filtered.length} utilisateur(s) · page {currentPage} sur {pageCount}
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={currentPage <= 1}
                className="rounded-md border border-input px-3 py-1.5 font-medium transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-40"
              >
                Précédent
              </button>
              <button
                onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                disabled={currentPage >= pageCount}
                className="rounded-md border border-input px-3 py-1.5 font-medium transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-40"
              >
                Suivant
              </button>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
