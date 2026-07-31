import {
  calendarEvents,
  clients,
  comments,
  deliverables,
  missions,
  monthlyEvolution,
  notifications,
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

const delay = <T,>(data: T, ms = 120): Promise<T> =>
  new Promise((resolve) => setTimeout(() => resolve(data), ms));

/* -------------------------------- Clients -------------------------------- */
export const clientService = {
  list: () => delay<Client[]>(clients),
  get: (id: string) => delay<Client | undefined>(clients.find((c) => c.id === id)),
};

/* ------------------------------ Utilisateurs ------------------------------ */
export const userService = {
  list: () => delay<User[]>(users),
  collaborators: () => delay<User[]>(users.filter((u) => u.role === "collaborateur")),
  get: (id: string) => delay<User | undefined>(users.find((u) => u.id === id)),
};

/* -------------------------------- Projets -------------------------------- */
export const projectService = {
  list: () => delay<Project[]>(projects),
  get: (id: string) => delay<Project | undefined>(projects.find((p) => p.id === id)),
  byClient: (clientId: string) => delay<Project[]>(projects.filter((p) => p.client_id === clientId)),
};

/* ------------------------------- Missions -------------------------------- */
export const missionService = {
  list: () => delay<Mission[]>(missions),
  get: (id: string) => delay<Mission | undefined>(missions.find((m) => m.id === id)),
  byAssignee: (userId: string) => delay<Mission[]>(missions.filter((m) => m.assignee_id === userId)),
  byProject: (projectId: string) =>
    delay<Mission[]>(missions.filter((m) => m.project_id === projectId)),
};

/* ------------------------------- Livrables -------------------------------- */
export const deliverableService = {
  list: () => delay<Deliverable[]>(deliverables),
  byMission: (missionId: string) =>
    delay<Deliverable[]>(deliverables.filter((d) => d.mission_id === missionId)),
};

/* ------------------------------ Commentaires ------------------------------ */
export const commentService = {
  byMission: (missionId: string) =>
    delay<Comment[]>(comments.filter((c) => c.mission_id === missionId)),
};

/* ------------------------------- Calendrier ------------------------------- */
export const calendarService = {
  list: () => delay<CalendarEvent[]>(calendarEvents),
};

/* ----------------------------- Notifications ------------------------------ */
export const notificationService = {
  list: () => delay<Notification[]>(notifications),
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
