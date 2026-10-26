/**
 * Notifications push de l'appareil courant (Web Push).
 *
 * Le navigateur s'abonne auprès de son service push (Google, Apple,
 * Mozilla) avec la clé publique du serveur, puis on transmet cet abonnement
 * au backend, qui y envoie chaque notification visible par l'utilisateur.
 * Les notifications s'affichent via public/sw.js, même OLYMPE fermé.
 */
import { api, endpoints, TOKEN_KEY } from "@/lib/api";

const SW_URL = "/sw.js";

export type PushState =
  /** Navigateur sans push (ancien, ou Huawei sans services Google...). */
  | "unsupported"
  /** iPhone / iPad : OLYMPE doit d'abord être ajouté à l'écran d'accueil. */
  | "ios-install"
  /** Le serveur n'a pas de clés push configurées. */
  | "server-disabled"
  /** L'utilisateur a refusé : seul le réglage du navigateur peut le rétablir. */
  | "denied"
  | "off"
  | "on";

export const isIos = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  // iPadOS se présente comme un Mac : on le reconnaît à l'écran tactile.
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

/** OLYMPE ouvert depuis l'icône de l'écran d'accueil (et non un onglet). */
export const isInstalled = () =>
  window.matchMedia("(display-mode: standalone)").matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

const supported = () =>
  "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

async function serverConfig() {
  return (
    await api.get<{ enabled: boolean; public_key: string }>(`${endpoints.notifications}push/`)
  ).data;
}

async function currentSubscription() {
  const registration = await navigator.serviceWorker.getRegistration(SW_URL);
  return (await registration?.pushManager.getSubscription()) ?? null;
}

export async function getPushState(): Promise<PushState> {
  if (!supported()) return isIos() && !isInstalled() ? "ios-install" : "unsupported";
  if (!(await serverConfig()).enabled) return "server-disabled";
  if (Notification.permission === "denied") return "denied";
  return Notification.permission === "granted" && (await currentSubscription()) ? "on" : "off";
}

/** Clé publique VAPID (base64url) -> octets attendus par pushManager.subscribe. */
function keyBytes(base64url: string) {
  const base64 = (base64url + "=".repeat((4 - (base64url.length % 4)) % 4))
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

/** Demande l'autorisation puis abonne l'appareil. Renvoie l'état obtenu. */
export async function enablePush(): Promise<PushState> {
  const { enabled, public_key } = await serverConfig();
  if (!enabled) return "server-disabled";
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return permission === "denied" ? "denied" : "off";
  const registration = await navigator.serviceWorker.register(SW_URL);
  await navigator.serviceWorker.ready;
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: keyBytes(public_key),
    }));
  await api.post(`${endpoints.notifications}push/`, subscription.toJSON());
  return "on";
}

export async function disablePush(): Promise<PushState> {
  const subscription = await currentSubscription();
  if (subscription) {
    await api.delete(`${endpoints.notifications}push/`, {
      data: { endpoint: subscription.endpoint },
    });
    await subscription.unsubscribe();
  }
  return "off";
}

/**
 * À la connexion : un appareil déjà autorisé est rattaché au compte qui vient
 * de se connecter, sans redemander la permission. Silencieux en cas d'échec.
 */
export async function syncPushDevice() {
  try {
    if (!supported() || Notification.permission !== "granted") return;
    const subscription = await currentSubscription();
    if (subscription) await api.post(`${endpoints.notifications}push/`, subscription.toJSON());
  } catch {
    // Pas de push sur cet appareil : la cloche reste la référence.
  }
}

/**
 * À la déconnexion : l'appareil cesse de recevoir les notifications de ce
 * compte (appareil partagé, changement d'utilisateur). La permission du
 * navigateur est conservée pour le prochain compte. Le jeton est lu tout de
 * suite : la déconnexion l'efface juste après.
 */
export function detachPushDevice() {
  if (typeof window === "undefined" || !supported()) return;
  const token = window.localStorage.getItem(TOKEN_KEY);
  if (!token) return;
  void currentSubscription()
    .then((subscription) =>
      subscription
        ? api.delete(`${endpoints.notifications}push/`, {
            data: { endpoint: subscription.endpoint },
            headers: { Authorization: `Bearer ${token}` },
          })
        : undefined,
    )
    .catch(() => undefined);
}
