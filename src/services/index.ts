import {
  clients,
  comments,
  deliverables,
  meetings,
  missions,
  monthlyEvolution,
  notifications,
  persistMockState,
  projects,
  users,
} from "@/lib/mock-data";
import type {
  CalendarEvent,
  Client,
  Comment,
  DashboardStats,
  Deliverable,
  Mission,
  Notification,
  Project,
  User,
} from "@/types";

/**
 * Couche services.
 *
 * Chaque fonction est asynchrone et retourne la même forme que l'API Django.
 * Pour brancher le backend, remplacer le corps par l'appel Axios commenté :
 *   const { data } = await api.get<Client[]>(endpoints.clients); return data;
 */

const delay = <T>(data: T, ms = 120): Promise<T> => {
  persistMockState();
  return new Promise((resolve) => setTimeout(() => resolve(data), ms));
};

/** Identifiant local (remplacé par l'id renvoyé par Django). */
const uid = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
const now = () => new Date().toISOString();

/* -------------------------------- Clients -------------------------------- */
export const clientService = {
  list: () => delay<Client[]>([...clients]),
  get: (id: string) => delay<Client | undefined>(clients.find((c) => c.id === id)),
  /** POST /api/v1/clients/ */
  create: (
    payload: Omit<Client, "id" | "created_at" | "contacts"> & {
      contacts?: Client["contacts"];
      created_at?: string;
    },
  ) => {
    const client: Client = { id: uid("cli"), created_at: now(), contacts: [], ...payload };
    clients.unshift(client);
    return delay(client);
  },
  /** PATCH /api/v1/clients/:id/ */
  update: (id: string, patch: Partial<Client>) => {
    const c = clients.find((x) => x.id === id);
    if (c) Object.assign(c, patch);
    return delay(c);
  },
  /** DELETE /api/v1/clients/:id/ */
  remove: (id: string) => {
    const i = clients.findIndex((x) => x.id === id);
    if (i >= 0) clients.splice(i, 1);
    // Détache tout compte utilisateur (rôle "client") encore lié à cette entreprise,
    // pour ne pas laisser de client_id fantôme pointant vers une fiche supprimée.
    users.forEach((u) => {
      if (u.client_id === id) delete u.client_id;
    });
    return delay(true);
  },
};

/* ------------------------------ Utilisateurs ------------------------------ */
export const userService = {
  list: () => delay<User[]>([...users]),
  /** POST /api/v1/users/ */
  create: (
    payload: Omit<User, "id" | "created_at" | "is_active"> & {
      is_active?: boolean;
      created_at?: string;
    },
  ) => {
    const user: User = { id: uid("usr"), created_at: now(), is_active: true, ...payload };
    users.push(user);
    return delay(user);
  },
  collaborators: () => delay<User[]>(users.filter((u) => u.role === "collaborateur")),
  /** PATCH /api/v1/users/:id/ */
  update: (id: string, patch: Partial<User>) => {
    const u = users.find((x) => x.id === id);
    if (u) Object.assign(u, patch);
    return delay(u);
  },
  toggleActive: (id: string) => {
    const u = users.find((x) => x.id === id);
    if (u) u.is_active = !u.is_active;
    return delay(u);
  },
  get: (id: string) => delay<User | undefined>(users.find((u) => u.id === id)),
  /** DELETE /api/v1/users/:id/ */
  remove: (id: string) => {
    const i = users.findIndex((x) => x.id === id);
    const removed = users[i];
    if (i >= 0) users.splice(i, 1);
    // La gestion des fiches entreprise passe entièrement par le compte utilisateur
    // "Client" : le supprimer supprime aussi l'entreprise qui lui était associée.
    if (removed?.client_id) {
      const ci = clients.findIndex((c) => c.id === removed.client_id);
      if (ci >= 0) clients.splice(ci, 1);
    }
    return delay(true);
  },
};

/* -------------------------------- Projets -------------------------------- */
export const projectService = {
  list: () => delay<Project[]>([...projects]),
  /** POST /api/v1/projects/ */
  create: (payload: Omit<Project, "id" | "created_at">) => {
    const project: Project = { id: uid("prj"), created_at: now(), ...payload };
    projects.unshift(project);
    return delay(project);
  },
  update: (id: string, patch: Partial<Project>) => {
    const p = projects.find((x) => x.id === id);
    if (p) Object.assign(p, patch);
    return delay(p);
  },
  get: (id: string) => delay<Project | undefined>(projects.find((p) => p.id === id)),
  byClient: (clientId: string) =>
    delay<Project[]>(projects.filter((p) => p.client_id === clientId)),
  /** DELETE /api/v1/projects/:id/ */
  remove: (id: string) => {
    const i = projects.findIndex((x) => x.id === id);
    if (i >= 0) projects.splice(i, 1);
    return delay(true);
  },
};

/* ------------------------------- Missions -------------------------------- */
export const missionService = {
  list: () => delay<Mission[]>([...missions]),
  /** POST /api/v1/missions/ */
  create: (payload: Omit<Mission, "id" | "created_at">) => {
    const mission: Mission = { id: uid("mis"), created_at: now(), ...payload };
    missions.unshift(mission);
    notifications.unshift({
      id: uid("ntf"),
      type: "mission_creee",
      title: "Nouvelle mission",
      body: mission.title,
      read: false,
      created_at: now(),
      link: `/missions/${mission.id}`,
    });
    return delay(mission);
  },
  updateStatus: (id: string, status: Mission["status"]) => {
    const m = missions.find((x) => x.id === id);
    if (m) m.status = status;
    return delay(m);
  },
  /** PATCH /api/v1/missions/:id/ */
  update: (id: string, patch: Partial<Mission>) => {
    const m = missions.find((x) => x.id === id);
    if (m) Object.assign(m, patch);
    return delay(m);
  },
  /** DELETE /api/v1/missions/:id/ */
  remove: (id: string) => {
    const i = missions.findIndex((x) => x.id === id);
    if (i >= 0) missions.splice(i, 1);
    return delay(true);
  },
  get: (id: string) => delay<Mission | undefined>(missions.find((m) => m.id === id)),
  byAssignee: (userId: string) =>
    delay<Mission[]>(missions.filter((m) => m.assignee_id === userId)),
  byProject: (projectId: string) =>
    delay<Mission[]>(missions.filter((m) => m.project_id === projectId)),
};

/* ------------------------------- Livrables -------------------------------- */
export const deliverableService = {
  list: () => delay<Deliverable[]>([...deliverables]),
  create: (payload: Omit<Deliverable, "id" | "created_at">) => {
    const d: Deliverable = { id: uid("dlv"), created_at: now(), ...payload };
    deliverables.unshift(d);
    return delay(d);
  },
  updateStatus: (id: string, status: Deliverable["status"]) => {
    const d = deliverables.find((x) => x.id === id);
    if (d) d.status = status;
    return delay(d);
  },
  byMission: (missionId: string) =>
    delay<Deliverable[]>(deliverables.filter((d) => d.mission_id === missionId)),
  /** DELETE /api/v1/files/:id/ */
  remove: (id: string) => {
    const i = deliverables.findIndex((x) => x.id === id);
    if (i >= 0) deliverables.splice(i, 1);
    return delay(true);
  },
};

/* ------------------------------ Commentaires ------------------------------ */
export const commentService = {
  list: () => delay<Comment[]>([...comments]),
  byMission: (missionId: string) =>
    delay<Comment[]>(comments.filter((c) => c.mission_id === missionId)),
  /** POST /api/v1/comments/ */
  create: (payload: Omit<Comment, "id" | "created_at" | "mentions"> & { mentions?: string[] }) => {
    const comment: Comment = {
      id: uid("cmt"),
      created_at: now(),
      mentions: payload.body.match(/@[\w.-]+/g) ?? [],
      ...payload,
    };
    comments.push(comment);
    return delay(comment);
  },
};

/* ------------------------------- Calendrier ------------------------------- */
export const calendarService = {
  /** Fusionne les échéances de missions, les dépôts de livrables et les réunions créées manuellement. */
  list: () => {
    const missionEvents: CalendarEvent[] = missions.map((m) => ({
      id: `ev-${m.id}`,
      title: m.title,
      date: m.deadline,
      type: "mission",
      mission_id: m.id,
    }));
    const deliverableEvents: CalendarEvent[] = deliverables.map((d) => ({
      id: `liv-${d.id}`,
      title: d.name,
      date: d.created_at,
      type: "livrable",
      mission_id: d.mission_id,
    }));
    return delay<CalendarEvent[]>([...missionEvents, ...deliverableEvents, ...meetings]);
  },
  /** POST — crée une réunion (seul type d'événement créable directement depuis le calendrier). */
  createMeeting: (payload: Omit<CalendarEvent, "id" | "type">) => {
    const event: CalendarEvent = { id: uid("meet"), type: "reunion", ...payload };
    meetings.push(event);
    return delay(event);
  },
  /** PATCH — déplacer (drag & drop) ou modifier une réunion. */
  updateMeeting: (id: string, patch: Partial<CalendarEvent>) => {
    const e = meetings.find((x) => x.id === id);
    if (e) Object.assign(e, patch);
    return delay(e);
  },
  removeMeeting: (id: string) => {
    const i = meetings.findIndex((x) => x.id === id);
    if (i >= 0) meetings.splice(i, 1);
    return delay(true);
  },
};

/* ----------------------------- Notifications ------------------------------ */
export const notificationService = {
  list: () => delay<Notification[]>([...notifications]),
  markRead: (id: string) => {
    const n = notifications.find((x) => x.id === id);
    if (n) n.read = true;
    return delay(n);
  },
  markAllRead: () => {
    notifications.forEach((n) => {
      n.read = true;
    });
    return delay([...notifications]);
  },
  remove: (id: string) => {
    const i = notifications.findIndex((x) => x.id === id);
    if (i >= 0) notifications.splice(i, 1);
    return delay(true);
  },
};

/* ------------------------------- Dashboard -------------------------------- */
const isLate = (m: Mission) =>
  new Date(m.deadline).getTime() < Date.now() && m.status !== "termine" && m.status !== "valide";

export const dashboardService = {
  stats: (): Promise<DashboardStats> =>
    delay({
      clients: clients.length,
      projects: projects.length,
      missions: missions.length,
      collaborators: users.filter((u) => u.role === "collaborateur").length,
      deliverables: deliverables.length,
      late_missions: missions.filter(isLate).length,
    }),
  missionsByClient: () =>
    delay(
      clients.map((c) => ({
        name: c.name,
        missions: missions.filter((m) => m.client_id === c.id).length,
      })),
    ),
  missionsByCollaborator: () =>
    delay(
      users
        .filter((u) => u.role === "collaborateur")
        .map((u) => ({
          name: `${u.first_name} ${u.last_name}`,
          missions: missions.filter((m) => m.assignee_id === u.id).length,
        })),
    ),
  monthly: () => delay(monthlyEvolution),
  completionRate: () =>
    delay(
      Math.round(
        (missions.filter((m) => m.status === "termine" || m.status === "valide").length /
          missions.length) *
          100,
      ),
    ),
  alerts: () => {
    const now = Date.now();
    const within = (h: number) =>
      missions.filter((m) => {
        const diff = new Date(m.deadline).getTime() - now;
        return diff > 0 && diff <= h * 3600 * 1000;
      });
    return delay({
      in24h: within(24),
      in48h: within(48).filter((m) => !within(24).includes(m)),
      blocked: missions.filter((m) => m.status === "corrections"),
      pendingDeliverables: deliverables.filter((d) => d.status === "en_attente"),
    });
  },
};

export { isLate };
