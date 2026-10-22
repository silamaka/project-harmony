import type { APIRequestContext, Page } from "@playwright/test";

/**
 * Accès direct à l'API pour préparer les données des tests (seeding) :
 * plus rapide et plus stable que de remplir les formulaires, qui changent
 * avec l'interface. Les tests, eux, vérifient le comportement à l'écran.
 */
export const API_URL = process.env["E2E_API_URL"] ?? "http://localhost:8000/api/v1";

export type Tokens = { access: string; refresh: string };

/** Connexion par l'API (limitée à 10 par minute côté serveur : à économiser). */
export async function apiLogin(request: APIRequestContext, email: string, password: string) {
  const res = await request.post(`${API_URL}/auth/login/`, { data: { email, password } });
  if (!res.ok()) throw new Error(`Connexion API refusée pour ${email} : ${res.status()}`);
  const body = (await res.json()) as Tokens & { user: { id: string } };
  return body;
}

/** Ouvre la session dans le navigateur avec des jetons déjà obtenus. */
export async function openSession(page: Page, tokens: Tokens) {
  await page.addInitScript(
    ([access, refresh]) => {
      localStorage.setItem("beba.access_token", access);
      localStorage.setItem("beba.refresh_token", refresh);
    },
    [tokens.access, tokens.refresh] as const,
  );
}

export async function api<T = unknown>(
  request: APIRequestContext,
  token: string,
  method: "GET" | "POST" | "PATCH" | "DELETE",
  path: string,
  data?: unknown,
): Promise<T> {
  const res = await request.fetch(`${API_URL}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}` },
    ...(data === undefined ? {} : { data }),
  });
  if (!res.ok()) throw new Error(`${method} ${path} → ${res.status()} ${await res.text()}`);
  return (res.status() === 204 ? undefined : await res.json()) as T;
}

/**
 * Crée une entreprise cliente, un compte client rattaché, un projet et une
 * mission (responsable : l'utilisateur du jeton). `cleanup` supprime le tout ;
 * lui passer un contexte encore ouvert (celui d'un beforeAll est fermé dès la
 * fin du hook).
 */
export async function seedClientMission(request: APIRequestContext, adminToken: string) {
  const suffix = Math.random().toString(36).slice(2, 8);
  const me = await api<{ id: string }>(request, adminToken, "GET", "/auth/me/");
  const company = await api<{ id: string }>(request, adminToken, "POST", "/clients/", {
    name: `Client E2E ${suffix}`,
  });
  const clientEmail = `client.${suffix}@e2e.test`;
  const clientUser = await api<{ id: string }>(request, adminToken, "POST", "/users/", {
    email: clientEmail,
    first_name: "Client",
    last_name: `E2E ${suffix}`,
    role: "client",
    client_id: company.id,
    password: "demo1234",
  });
  const today = new Date().toISOString().slice(0, 10);
  const project = await api<{ id: string }>(request, adminToken, "POST", "/projects/", {
    name: `Projet E2E ${suffix}`,
    client_id: company.id,
    owner_id: me.id,
    start_date: today,
    end_date: today,
  });
  const title = `Mission E2E ${suffix}`;
  const mission = await api<{ id: string }>(request, adminToken, "POST", "/missions/", {
    title,
    project_id: project.id,
    assignee_id: me.id,
    start_date: today,
    deadline: today,
  });
  return {
    title,
    missionId: mission.id,
    clientEmail,
    cleanup: async (context: APIRequestContext = request) => {
      // L'entreprise d'abord : elle emporte projets, missions, livrables et
      // commentaires ; le compte client (auteur de commentaires, protégés)
      // ne peut être supprimé qu'ensuite.
      await api(context, adminToken, "DELETE", `/clients/${company.id}/`);
      await api(context, adminToken, "DELETE", `/users/${clientUser.id}/`);
    },
  };
}
