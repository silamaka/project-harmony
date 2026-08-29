/**
 * Types métier partagés de la plateforme BEBA EMPIRE.
 * Ces types reflètent les schémas attendus de l'API Django REST Framework.
 */

export type Role = "admin" | "chef_projet" | "collaborateur" | "client";

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Administrateur",
  chef_projet: "Chef de projet",
  collaborateur: "Collaborateur",
  client: "Client",
};

/** Route d'accueil par rôle (redirection post-connexion). */
export const ROLE_HOME: Record<Role, string> = {
  admin: "/dashboard",
  chef_projet: "/dashboard",
  collaborateur: "/mes-missions",
  client: "/portail",
};

export interface User {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone?: string;
  role: Role;
  avatar_url?: string;
  job_title?: string;
  workload?: number; // charge de travail en %
  /** Entreprise associée, uniquement pertinent pour un compte de rôle "client". */
  client_id?: string;
  is_active: boolean;
  created_at: string;
}

export interface Contact {
  id: string;
  name: string;
  email: string;
  phone?: string;
  position?: string;
}

export interface Client {
  id: string;
  name: string;
  industry: string;
  email: string;
  phone?: string;
  address?: string;
  logo_url?: string;
  status: "actif" | "inactif" | "prospect";
  contacts: Contact[];
  created_at: string;
}

export type ProjectStatus =
  "brouillon" | "en_preparation" | "en_cours" | "en_attente" | "termine" | "archive";

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  brouillon: "Brouillon",
  en_preparation: "En préparation",
  en_cours: "En cours",
  en_attente: "En attente",
  termine: "Terminé",
  archive: "Archivé",
};

export interface Project {
  id: string;
  name: string;
  client_id: string;
  description: string;
  start_date: string;
  end_date: string;
  status: ProjectStatus;
  progress: number;
  owner_id: string;
  created_at: string;
}

export type MissionStatus =
  | "a_faire"
  | "en_cours"
  | "livrable_depose"
  | "validation_interne"
  | "envoye_client"
  | "valide"
  | "corrections"
  | "publie"
  | "termine";

export const MISSION_STATUS_LABELS: Record<MissionStatus, string> = {
  a_faire: "À faire",
  en_cours: "En cours",
  livrable_depose: "Livrable déposé",
  validation_interne: "Validation interne",
  envoye_client: "Envoyé au client",
  valide: "Validé",
  corrections: "Corrections demandées",
  publie: "Publié",
  termine: "Terminé",
};

/** Ordre du workflow Kanban. */
export const MISSION_WORKFLOW: MissionStatus[] = [
  "a_faire",
  "en_cours",
  "livrable_depose",
  "validation_interne",
  "envoye_client",
  "valide",
  "corrections",
  "publie",
  "termine",
];

export type Priority = "faible" | "normale" | "haute" | "urgente";

export const PRIORITY_LABELS: Record<Priority, string> = {
  faible: "Faible",
  normale: "Normale",
  haute: "Haute",
  urgente: "Urgente",
};

/** Ordre du plus urgent au moins urgent, pour trier les listes de missions. */
export const PRIORITY_ORDER: Priority[] = ["urgente", "haute", "normale", "faible"];

export interface Mission {
  id: string;
  title: string;
  description: string;
  priority: Priority;
  assignee_id: string;
  /** Contributeurs additionnels : même accès en lecture/statut/priorité que le responsable. */
  collaborators: string[];
  project_id: string;
  client_id: string;
  start_date: string;
  deadline: string;
  status: MissionStatus;
  created_at: string;
}

export type DeliverableType = "pdf" | "image" | "zip" | "video" | "lien";

export interface Deliverable {
  id: string;
  mission_id: string;
  name: string;
  type: DeliverableType;
  url: string;
  version: number;
  size_kb?: number;
  uploaded_by: string;
  status: "en_attente" | "valide" | "corrections";
  created_at: string;
}

export interface Comment {
  id: string;
  mission_id: string;
  author_id: string;
  body: string;
  parent_id?: string | null;
  attachment_url?: string;
  mentions: string[];
  created_at: string;
}

export interface CalendarEvent {
  id: string;
  title: string;
  date: string;
  time?: string;
  description?: string;
  type: "mission" | "livrable" | "reunion";
  mission_id?: string;
  color?: string;
}

export interface Notification {
  id: string;
  type:
    | "mission_creee"
    | "mission_assignee"
    | "commentaire"
    | "livrable"
    | "validation"
    | "correction"
    | "retard";
  title: string;
  body: string;
  read: boolean;
  created_at: string;
  link?: string;
  /** Mission concernée, utilisée pour ne montrer aux collaborateurs que ce qui les concerne. */
  mission_id?: string;
}

export interface DashboardStats {
  clients: number;
  projects: number;
  missions: number;
  collaborators: number;
  deliverables: number;
  late_missions: number;
}
