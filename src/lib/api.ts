import axios, { type AxiosInstance } from "axios";

/**
 * Client HTTP prêt à être branché sur l'API Django REST Framework.
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

/** Déconnexion automatique sur 401. */
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 401 && typeof window !== "undefined") {
      window.localStorage.removeItem(TOKEN_KEY);
      window.localStorage.removeItem(REFRESH_KEY);
    }
    return Promise.reject(error);
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
  statistics: "/statistics/",
} as const;
