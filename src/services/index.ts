import { api, endpoints } from "@/lib/api";
import type {
  CalendarEvent,
  Client,
  Comment,
  Deliverable,
  Mission,
  Notification,
  Project,
  User,
} from "@/types";

/**
 * Couche services — branchée sur l'API Django REST Framework réelle
 * (voir backend/, phases 0 à 5). Chaque fonction correspond exactement à
 * l'appel documenté en commentaire.
 *
 * Ce qui vivait ici en logique locale du temps des données mock (cascades
 * de suppression, création de notification à la création d'une mission,
 * filtrage par utilisateur connecté) est désormais géré côté serveur —
 * ces fonctions ne sont plus que de fins appels HTTP.
 */

/* -------------------------------------------------------------------------- */
export const authService = {
  /** POST /api/v1/auth/password/forgot/ — toujours une réponse "succès",
   * qu'un compte existe ou non pour l'adresse fournie. */
  forgotPassword: async (email: string) => {
    await api.post(endpoints.auth.forgotPassword, { email });
  },
  /** POST /api/v1/auth/password/reset/ */
  resetPassword: async (uid: string, token: string, password: string) => {
    await api.post(endpoints.auth.resetPassword, { uid, token, password });
  },
};

/* -------------------------------- Clients -------------------------------- */
export const clientService = {
  /** GET /api/v1/clients/ */
  list: async () => (await api.get<Client[]>(endpoints.clients)).data,
  /** GET /api/v1/clients/:id/ */
  get: async (id: string) => (await api.get<Client>(`${endpoints.clients}${id}/`)).data,
  /** POST /api/v1/clients/ */
  create: async (
    payload: Omit<Client, "id" | "created_at" | "contacts"> & {
      contacts?: Client["contacts"];
      created_at?: string;
    },
  ) => (await api.post<Client>(endpoints.clients, payload)).data,
  /** PATCH /api/v1/clients/:id/ */
  update: async (id: string, patch: Partial<Client>) =>
    (await api.patch<Client>(`${endpoints.clients}${id}/`, patch)).data,
  /** DELETE /api/v1/clients/:id/ */
  remove: async (id: string) => {
    await api.delete(`${endpoints.clients}${id}/`);
    return true;
  },
};

/* ------------------------------ Utilisateurs ------------------------------ */
export const userService = {
  /** GET /api/v1/users/ */
  list: async () => (await api.get<User[]>(endpoints.users)).data,
  /** POST /api/v1/users/ */
  create: async (
    payload: Omit<User, "id" | "created_at" | "is_active"> & {
      is_active?: boolean;
      created_at?: string;
      password: string;
    },
  ) => (await api.post<User>(endpoints.users, payload)).data,
  /** GET /api/v1/users/?role=collaborateur */
  collaborators: async () =>
    (await api.get<User[]>(endpoints.users, { params: { role: "collaborateur" } })).data,
  /** PATCH /api/v1/users/:id/ */
  update: async (id: string, patch: Partial<User> & { password?: string }) =>
    (await api.patch<User>(`${endpoints.users}${id}/`, patch)).data,
  /** PATCH /api/v1/users/:id/ (is_active) — POST .../toggle_active/ côté API */
  toggleActive: async (id: string) =>
    (await api.post<User>(`${endpoints.users}${id}/toggle_active/`)).data,
  /** GET /api/v1/users/:id/ */
  get: async (id: string) => (await api.get<User>(`${endpoints.users}${id}/`)).data,
  /** DELETE /api/v1/users/:id/ */
  remove: async (id: string) => {
    await api.delete(`${endpoints.users}${id}/`);
    return true;
  },
};

/* -------------------------------- Projets -------------------------------- */
export const projectService = {
  /** GET /api/v1/projects/ */
  list: async () => (await api.get<Project[]>(endpoints.projects)).data,
  /** POST /api/v1/projects/ — progress est calculé côté serveur à partir des missions. */
  create: async (payload: Omit<Project, "id" | "created_at" | "progress">) =>
    (await api.post<Project>(endpoints.projects, payload)).data,
  /** PATCH /api/v1/projects/:id/ */
  update: async (id: string, patch: Partial<Project>) =>
    (await api.patch<Project>(`${endpoints.projects}${id}/`, patch)).data,
  /** GET /api/v1/projects/:id/ */
  get: async (id: string) => (await api.get<Project>(`${endpoints.projects}${id}/`)).data,
  /** GET /api/v1/projects/?client=:clientId */
  byClient: async (clientId: string) =>
    (await api.get<Project[]>(endpoints.projects, { params: { client: clientId } })).data,
  /** DELETE /api/v1/projects/:id/ */
  remove: async (id: string) => {
    await api.delete(`${endpoints.projects}${id}/`);
    return true;
  },
};

/* ------------------------------- Missions -------------------------------- */
export const missionService = {
  /** GET /api/v1/missions/ */
  list: async () => (await api.get<Mission[]>(endpoints.missions)).data,
  /** POST /api/v1/missions/ */
  create: async (payload: Omit<Mission, "id" | "created_at"> & { created_at?: string }) =>
    (await api.post<Mission>(endpoints.missions, payload)).data,
  /** PATCH /api/v1/missions/:id/ (status) */
  updateStatus: async (id: string, status: Mission["status"]) =>
    (await api.patch<Mission>(`${endpoints.missions}${id}/`, { status })).data,
  /** PATCH /api/v1/missions/:id/ */
  update: async (id: string, patch: Partial<Mission>) =>
    (await api.patch<Mission>(`${endpoints.missions}${id}/`, patch)).data,
  /** DELETE /api/v1/missions/:id/ */
  remove: async (id: string) => {
    await api.delete(`${endpoints.missions}${id}/`);
    return true;
  },
  /** GET /api/v1/missions/:id/ */
  get: async (id: string) => (await api.get<Mission>(`${endpoints.missions}${id}/`)).data,
  /** GET /api/v1/missions/?assignee=:userId */
  byAssignee: async (userId: string) =>
    (await api.get<Mission[]>(endpoints.missions, { params: { assignee: userId } })).data,
  /** GET /api/v1/missions/?project=:projectId */
  byProject: async (projectId: string) =>
    (await api.get<Mission[]>(endpoints.missions, { params: { project: projectId } })).data,
};

/* ------------------------------- Livrables -------------------------------- */
export const deliverableService = {
  /** GET /api/v1/deliverables/ */
  list: async () => (await api.get<Deliverable[]>(endpoints.deliverables)).data,
  /** POST /api/v1/deliverables/ */
  create: async (payload: Omit<Deliverable, "id" | "created_at" | "uploaded_by">) =>
    (await api.post<Deliverable>(endpoints.deliverables, payload)).data,
  /** PATCH /api/v1/deliverables/:id/ (status) */
  updateStatus: async (id: string, status: Deliverable["status"]) =>
    (await api.patch<Deliverable>(`${endpoints.deliverables}${id}/`, { status })).data,
  /** GET /api/v1/deliverables/?mission=:missionId */
  byMission: async (missionId: string) =>
    (await api.get<Deliverable[]>(endpoints.deliverables, { params: { mission: missionId } })).data,
  /** DELETE /api/v1/deliverables/:id/ */
  remove: async (id: string) => {
    await api.delete(`${endpoints.deliverables}${id}/`);
    return true;
  },
};

/* ------------------------------ Commentaires ------------------------------ */
export const commentService = {
  /** GET /api/v1/comments/ */
  list: async () => (await api.get<Comment[]>(endpoints.comments)).data,
  /** GET /api/v1/comments/?mission=:missionId */
  byMission: async (missionId: string) =>
    (await api.get<Comment[]>(endpoints.comments, { params: { mission: missionId } })).data,
  /**
   * POST /api/v1/comments/
   * Les mentions envoyées ici sont ignorées par le serveur, qui les
   * ré-extrait lui-même depuis `body` (voir backend/comments/serializers.py).
   */
  create: async (payload: Omit<Comment, "id" | "created_at" | "mentions" | "author_id">) =>
    (await api.post<Comment>(endpoints.comments, payload)).data,
};

/* ------------------------------- Calendrier ------------------------------- */
export const calendarService = {
  /** GET /api/v1/calendar/ — portée déjà filtrée côté serveur selon le rôle. */
  list: async () => (await api.get<CalendarEvent[]>(endpoints.calendar)).data,
  /** POST /api/v1/meetings/ */
  createMeeting: async (payload: Omit<CalendarEvent, "id" | "type">) =>
    (await api.post<CalendarEvent>(endpoints.meetings, payload)).data,
  /** PATCH /api/v1/meetings/:id/ */
  updateMeeting: async (id: string, patch: Partial<CalendarEvent>) =>
    (await api.patch<CalendarEvent>(`${endpoints.meetings}${id}/`, patch)).data,
  /** DELETE /api/v1/meetings/:id/ */
  removeMeeting: async (id: string) => {
    await api.delete(`${endpoints.meetings}${id}/`);
    return true;
  },
};

/* ----------------------------- Notifications ------------------------------ */
export const notificationService = {
  /** GET /api/v1/notifications/ — portée déjà filtrée côté serveur. */
  list: async () => (await api.get<Notification[]>(endpoints.notifications)).data,
  /** PATCH /api/v1/notifications/:id/ (read=true) */
  markRead: async (id: string) =>
    (await api.patch<Notification>(`${endpoints.notifications}${id}/`, { read: true })).data,
  /** POST /api/v1/notifications/mark-all-read/ */
  markAllRead: async () =>
    (await api.post<Notification[]>(`${endpoints.notifications}mark-all-read/`)).data,
  /** DELETE /api/v1/notifications/:id/ */
  remove: async (id: string) => {
    await api.delete(`${endpoints.notifications}${id}/`);
    return true;
  },
};

/* ------------------------------- Dashboard -------------------------------- */
/** Toujours calculable côté client à partir d'une liste de missions déjà
 * chargée (filtre de période du Dashboard, etc.) — ce n'est pas un appel
 * réseau, donc ça reste une fonction pure locale. */
const isLate = (m: Mission) =>
  new Date(m.deadline).getTime() < Date.now() &&
  m.status !== "termine" &&
  m.status !== "valide" &&
  m.status !== "publie";

/** Même logique que isLate, côté projet : date de fin dépassée alors que le
 * projet n'est pas dans un état final (terminé/archivé). */
const isProjectLate = (p: Project) =>
  new Date(p.end_date).getTime() < Date.now() && p.status !== "termine" && p.status !== "archive";

export const dashboardService = {
  /** GET /api/v1/dashboard/monthly/ */
  monthly: async () =>
    (
      await api.get<{ month: string; missions: number; livrables: number }[]>(
        `${endpoints.dashboard}monthly/`,
      )
    ).data,
  /** GET /api/v1/dashboard/alerts/ */
  alerts: async () =>
    (
      await api.get<{
        in24h: Mission[];
        in48h: Mission[];
        blocked: Mission[];
        pendingDeliverables: Deliverable[];
      }>(`${endpoints.dashboard}alerts/`)
    ).data,
};

export { isLate, isProjectLate };
