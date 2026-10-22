import axios, { type AxiosInstance, type InternalAxiosRequestConfig } from "axios";

/**
 * Client HTTP branché sur l'API Django REST Framework.
 * Base URL configurable via VITE_API_URL (défaut: /api/v1).
 */
export const API_BASE_URL = (import.meta.env["VITE_API_URL"] as string | undefined) ?? "/api/v1";

export const TOKEN_KEY = "beba.access_token";
export const REFRESH_KEY = "beba.refresh_token";

export const api: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  headers: { "Content-Type": "application/json" },
});

/** Injection automatique du JWT sur chaque requête. */
api.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = window.localStorage.getItem(TOKEN_KEY);
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

function clearTokens() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(REFRESH_KEY);
}

type RetryableConfig = InternalAxiosRequestConfig & { _retried?: boolean };

/** Rafraîchit le token une seule fois par requête en échec avant de
 * déconnecter — l'access token dure 30 min, sans ça l'utilisateur serait
 * déconnecté en pleine session à chaque expiration. */
let refreshPromise: Promise<string> | null = null;

async function refreshAccessToken(): Promise<string> {
  refreshPromise ??= (async () => {
    const refresh = window.localStorage.getItem(REFRESH_KEY);
    if (!refresh) throw new Error("no refresh token");
    const { data } = await axios.post<{ access: string; refresh?: string }>(
      `${API_BASE_URL}${endpoints.auth.refresh}`,
      { refresh },
    );
    window.localStorage.setItem(TOKEN_KEY, data.access);
    if (data.refresh) window.localStorage.setItem(REFRESH_KEY, data.refresh);
    return data.access;
  })().finally(() => {
    refreshPromise = null;
  });
  return refreshPromise;
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const config = error?.config as RetryableConfig | undefined;
    const status = error?.response?.status;
    if (typeof window === "undefined" || status !== 401 || !config || config._retried) {
      if (status === 401) clearTokens();
      return Promise.reject(error);
    }
    config._retried = true;
    try {
      const access = await refreshAccessToken();
      config.headers.Authorization = `Bearer ${access}`;
      return api(config);
    } catch {
      clearTokens();
      return Promise.reject(error);
    }
  },
);

/**
 * Endpoints de l'API v1 — source unique de vérité côté frontend.
 */
export const endpoints = {
  auth: {
    login: "/auth/login/",
    refresh: "/auth/refresh/",
    me: "/auth/me/",
    forgotPassword: "/auth/password/forgot/",
    resetPassword: "/auth/password/reset/",
    changePassword: "/auth/password/change/",
  },
  users: "/users/",
  clients: "/clients/",
  projects: "/projects/",
  missions: "/missions/",
  comments: "/comments/",
  deliverables: "/deliverables/",
  dashboard: "/dashboard/",
  calendar: "/calendar/",
  meetings: "/meetings/",
  notifications: "/notifications/",
} as const;

/**
 * Message d'erreur affiché à l'utilisateur : le message de l'action
 * ("Dépôt impossible.") suivi de la vraie raison renvoyée par le serveur
 * (validation, droits, panne, réseau) plutôt qu'un échec muet.
 */
export function errorMessage(error: unknown, fallback: string): string {
  if (!axios.isAxiosError(error)) return fallback;
  const response = error.response;
  if (!response) return `${fallback} Serveur injoignable : vérifiez votre connexion.`;
  if (response.status >= 500) {
    return `${fallback} Erreur du serveur : réessayez ou prévenez l'administrateur.`;
  }
  const reason = firstMessage(response.data);
  if (reason) return `${fallback} ${reason}`;
  if (response.status === 403) return `${fallback} Action non autorisée.`;
  if (response.status === 404) return `${fallback} Élément introuvable (supprimé entre-temps ?).`;
  return fallback;
}

/** Premier message lisible d'une réponse DRF : {detail}, {champ: [msg]}, [msg] ou "msg". */
function firstMessage(data: unknown): string | undefined {
  if (typeof data === "string") return data.length < 300 && !data.includes("<") ? data : undefined;
  if (Array.isArray(data)) return data.map(firstMessage).find(Boolean);
  if (data && typeof data === "object") {
    const record = data as Record<string, unknown>;
    return firstMessage(record["detail"]) ?? Object.values(record).map(firstMessage).find(Boolean);
  }
  return undefined;
}
