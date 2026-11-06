/**
 * Types métier partagés de la plateforme OLYMPE (BEBA EMPIRE).
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
  /** Dernière connexion (ISO) : renvoyée à l'admin et au chef de projet seulement. */
  last_login?: string | null;
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
  /** Contenus promis chaque mois (jauge du dashboard). */
  monthly_quota: number;
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

export type TaskType = "mission" | "livrable" | "descente";

/** Ce que le client demande de corriger (miroir de CorrectionCategory côté serveur). */
export type CorrectionCategory =
  "texte" | "visuel" | "mise_en_page" | "image" | "contenu" | "autre";

export const CORRECTION_CATEGORY_LABELS: Record<CorrectionCategory, string> = {
  texte: "Texte / orthographe",
  visuel: "Couleurs / visuel",
  mise_en_page: "Mise en page",
  image: "Image / photo",
  contenu: "Contenu à ajouter ou retirer",
  autre: "Autre",
};

export const TASK_TYPE_LABELS: Record<TaskType, string> = {
  mission: "Mission",
  livrable: "Livrable",
  descente: "Descente",
};

export interface MissionSource {
  label: string;
  url: string;
}

export interface Mission {
  id: string;
  title: string;
  description: string;
  /** Liens de référence (brief client, Drive, Figma...). */
  sources: MissionSource[];
  /** Étiquette de catégorisation, purement indicative (n'affecte pas le modèle de données ni les permissions). */
  task_type: TaskType;
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

/** Contenu : validé, programmé, publié, compté dans le forfait. Document :
 * simplement transmis au client. */
export type DeliverableNature = "contenu" | "document";

export interface Deliverable {
  id: string;
  mission_id: string;
  name: string;
  type: DeliverableType;
  /** Vide tant que le livrable est seulement annoncé ("Lien à venir"). */
  url: string;
  version: number;
  size_kb?: number;
  uploaded_by: string;
  /** Validation de l'agence : un livrable validé est envoyé au client (il ne
   * voit rien avant). */
  status: "en_attente" | "valide" | "corrections";
  /** Décision du client sur ce qu'il a reçu. Un nouveau lien remet les deux
   * statuts à "en_attente". */
  client_status: "en_attente" | "valide" | "corrections";
  /** Dernière demande de corrections du client (vide sinon), posée par le
   * serveur ; effacée quand il valide ou qu'un nouveau lien arrive. */
  client_feedback: string;
  client_feedback_at?: string | null;
  /** Catégories et lien d'exemple joints à cette demande de corrections. */
  client_feedback_categories: CorrectionCategory[];
  client_feedback_link: string;
  /** Date de la validation du client (posée par le serveur), null sinon. */
  client_validated_at?: string | null;
  /** Qui a enregistré la décision pour le client (vide s'il a décidé lui-même). */
  client_decided_by_name: string;
  /** Qui, dans l'équipe du client, a décidé lui-même (vide sinon). */
  client_decision_author_name?: string;
  nature: DeliverableNature;
  /** Date de publication (posée par le serveur), null tant que non publié. */
  published_at?: string | null;
  /** Date de publication prévue, programmée par l'équipe (null sinon). */
  scheduled_at?: string | null;
  created_at: string;
}

export interface Comment {
  id: string;
  mission_id: string;
  author_id: string;
  body: string;
  parent_id?: string | null;
  attachment_url?: string;
  /** Interne par défaut ; visible du client seulement si coché (toujours
   * vrai pour un commentaire écrit par le client). */
  client_visible?: boolean;
  /** Personnes mentionnées (ids), retenues par le serveur. */
  mentions: string[];
  created_at: string;
}

export interface CalendarEvent {
  id: string;
  title: string;
  date: string;
  time?: string;
  description?: string;
  /** "publication" : publication prévue d'un livrable (id "pub-…"). */
  type: TaskType | "publication";
  mission_id?: string;
  /** Livrable concerné (publication prévue) : la fiche s'ouvre sur lui. */
  deliverable_id?: string;
  /** Client et projet de la mission (filtres du calendrier). */
  client_id?: string;
  project_id?: string;
  /** Date et heure complètes d'une publication prévue (ISO). */
  scheduled_at?: string;
  /** Publication effectuée (ISO), null tant qu'elle ne l'est pas. */
  published_at?: string | null;
  /** Publication dont le livrable attend encore la validation du client. */
  awaiting_client?: boolean;
  /** Livrable disponible pour le client : quand l'agence le lui a envoyé (ISO). */
  available_at?: string;
  /** Livrable : contenu ou document (sous-filtre du calendrier). */
  nature?: DeliverableNature;
  /** Équipe de la mission (calendrier de l'agence seulement, jamais au client). */
  assignee_id?: string;
  collaborators?: string[];
  /** Statut de la mission, présent sur les échéances de mission uniquement. */
  status?: MissionStatus;
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
    | "retard"
    | "decision_client"
    | "publication"
    | "mention"
    | "campagne";
  title: string;
  body: string;
  read: boolean;
  created_at: string;
  link?: string;
  /** Mission concernée, utilisée pour ne montrer aux collaborateurs que ce qui les concerne. */
  mission_id?: string;
  /** Livrable concerné (décision du client, envoi) : la fiche mission s'ouvre sur lui. */
  deliverable_id?: string;
}

export interface DashboardStats {
  clients: number;
  projects: number;
  missions: number;
  collaborators: number;
  deliverables: number;
  late_missions: number;
}

/* ------------------------------- Campagnes ------------------------------- */
export type CampaignStatus = "preparation" | "en_cours" | "pause" | "terminee";
export type CampaignObjective =
  "messages" | "prospects" | "ventes" | "visites" | "trafic" | "abonnes" | "notoriete";
export type CampaignPlatform = "meta" | "tiktok" | "snapchat" | "google" | "autre";

export const CAMPAIGN_STATUS_LABELS: Record<CampaignStatus, string> = {
  preparation: "En préparation",
  en_cours: "En cours",
  pause: "En pause",
  terminee: "Terminée",
};
export const CAMPAIGN_OBJECTIVE_LABELS: Record<CampaignObjective, string> = {
  messages: "Messages (WhatsApp, Messenger)",
  prospects: "Prospects",
  ventes: "Ventes en ligne",
  visites: "Visites en boutique",
  trafic: "Trafic (clics)",
  abonnes: "Abonnés",
  notoriete: "Notoriété",
};
/** Unité d'un résultat, pour les libellés ("200 messages", "coût par vente"). */
export const CAMPAIGN_RESULT_UNIT: Record<CampaignObjective, string> = {
  messages: "messages",
  prospects: "prospects",
  ventes: "ventes",
  visites: "visites",
  trafic: "clics",
  abonnes: "abonnés",
  notoriete: "personnes touchées",
};
export const CAMPAIGN_PLATFORM_LABELS: Record<CampaignPlatform, string> = {
  meta: "Meta",
  tiktok: "TikTok",
  snapchat: "Snapchat",
  google: "Google",
  autre: "Autre",
};

/** Relevé à une date : totaux depuis le début de la campagne. */
export interface CampaignReport {
  id: string;
  date: string;
  spend: number;
  reach: number | null;
  impressions: number | null;
  clicks: number | null;
  results: number;
  created_at: string;
}

export interface Campaign {
  id: string;
  client_id: string;
  project_id: string | null;
  name: string;
  platforms: CampaignPlatform[];
  objective: CampaignObjective;
  objective_target: number | null;
  start_date: string;
  end_date: string | null;
  status: CampaignStatus;
  budget_ht: number;
  tva_rate: number;
  paid_by: "client" | "agence";
  targeting: string;
  /** Absent pour le client. */
  internal_notes?: string;
  content_ids: string[];
  reports: CampaignReport[];
  /** Calculé par le serveur. */
  summary: {
    budget_tva: number;
    budget_ttc: number;
    spend: number;
    reach: number | null;
    impressions: number | null;
    clicks: number | null;
    results: number;
    cost_per_result: number | null;
    results_progress: number | null;
    budget_used: number | null;
    last_report_date: string | null;
    last_period: { spend: number; results: number } | null;
  };
  created_at: string;
}

export type CampaignInput = Omit<Campaign, "id" | "reports" | "summary" | "created_at">;
