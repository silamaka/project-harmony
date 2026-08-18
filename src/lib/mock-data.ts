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
 * Jeu de données de l'application.
 * À remplacer par les appels API Django (voir src/services).
 *
 * Seuls les comptes de connexion sont pré-remplis (un par rôle, pour pouvoir
 * se connecter et tester) ; toute donnée métier (clients, projets, missions,
 * livrables, commentaires, réunions, notifications) démarre vide et ne se
 * remplit que via l'utilisation réelle de l'application.
 */

export const users: User[] = [
  {
    id: "u1",
    first_name: "Amine",
    last_name: "Bekkari",
    email: "admin@bebaempire.com",
    phone: "+212 6 61 20 30 40",
    role: "admin",
    job_title: "Directeur d'agence",
    is_active: true,
    created_at: "2024-01-12",
  },
  {
    id: "u2",
    first_name: "Sara",
    last_name: "Lahlou",
    email: "sara@bebaempire.com",
    phone: "+212 6 12 45 78 90",
    role: "chef_projet",
    job_title: "Chef de projet senior",
    is_active: true,
    created_at: "2024-02-03",
  },
  {
    id: "u3",
    first_name: "Yassine",
    last_name: "Rami",
    email: "yassine@bebaempire.com",
    phone: "+212 6 55 44 33 22",
    role: "collaborateur",
    job_title: "Directeur artistique",
    is_active: true,
    created_at: "2024-03-18",
  },
  {
    id: "u4",
    first_name: "Nadia",
    last_name: "Fassi",
    email: "nadia@bebaempire.com",
    phone: "+212 6 77 88 99 00",
    role: "collaborateur",
    job_title: "Community manager",
    is_active: true,
    created_at: "2024-04-02",
  },
  {
    id: "u5",
    first_name: "Omar",
    last_name: "Benjelloun",
    email: "omar@atlasretail.com",
    phone: "+212 5 22 11 00 99",
    role: "client",
    job_title: "Directeur marketing",
    is_active: true,
    created_at: "2024-05-21",
  },
];

export const clients: Client[] = [];

export const projects: Project[] = [];

export const missions: Mission[] = [];

export const deliverables: Deliverable[] = [];

export const comments: Comment[] = [];

/** Réunions créées manuellement depuis le calendrier (les événements mission/livrable sont dérivés à la volée par le service). */
export const meetings: CalendarEvent[] = [];

export const notifications: Notification[] = [];

export const monthlyEvolution: { month: string; missions: number; livrables: number }[] = [];

/**
 * Persistance locale (navigateur) du jeu de données de démonstration.
 *
 * Tant qu'aucun backend n'est branché, l'état vit en mémoire côté serveur de
 * dev : un redémarrage du serveur (ou un HMR "program reload") le réinitialise,
 * ce qui donne l'impression que les actions ne sont pas prises en compte. On
 * sauvegarde donc une copie dans le localStorage du navigateur et on la
 * réhydrate au chargement, pour que les modifications survivent aux
 * rafraîchissements de page et aux redémarrages du serveur.
 *
 * Incrémenter STORAGE_KEY à chaque changement non-trivial du jeu de données
 * de démo (nouveau champ, nouvelle relation...) : sinon les navigateurs ayant
 * déjà un snapshot persisté restent bloqués indéfiniment sur l'ancienne forme
 * des données, invisibles aux mises à jour du code source.
 */
const STORAGE_KEY = "beba.mock-state.v3";

interface PersistedState {
  users: User[];
  clients: Client[];
  projects: Project[];
  missions: Mission[];
  deliverables: Deliverable[];
  comments: Comment[];
  meetings: CalendarEvent[];
  notifications: Notification[];
}

function loadPersistedState(): PersistedState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as PersistedState) : null;
  } catch {
    return null;
  }
}

/** À appeler après chaque mutation des services pour sauvegarder l'état courant. */
export function persistMockState() {
  if (typeof window === "undefined") return;
  try {
    const snapshot: PersistedState = {
      users,
      clients,
      projects,
      missions,
      deliverables,
      comments,
      meetings,
      notifications,
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    /* stockage indisponible (mode privé, quota...) : on continue sans persister */
  }
}

const persisted = loadPersistedState();
if (persisted) {
  users.length = 0;
  users.push(...persisted.users);
  clients.length = 0;
  clients.push(...persisted.clients);
  projects.length = 0;
  projects.push(...persisted.projects);
  missions.length = 0;
  missions.push(...persisted.missions);
  deliverables.length = 0;
  deliverables.push(...persisted.deliverables);
  comments.length = 0;
  comments.push(...persisted.comments);
  meetings.length = 0;
  meetings.push(...persisted.meetings);
  notifications.length = 0;
  notifications.push(...persisted.notifications);
}
