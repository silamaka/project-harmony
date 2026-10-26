/* Service worker OLYMPE : affiche les notifications push, même OLYMPE fermé.
 * Le serveur envoie { title, body, url, tag } (backend/notifications/push.py). */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "OLYMPE", {
      body: data.body || "",
      icon: "/beba-logo-256.png",
      badge: "/beba-logo-256.png",
      tag: data.tag,
      renotify: Boolean(data.tag),
      data: { url: data.url || "/notifications" },
    }),
  );
});

// Clic : réutilise un onglet OLYMPE déjà ouvert, sinon en ouvre un.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((tabs) => {
      for (const tab of tabs) {
        if (new URL(tab.url).origin === self.location.origin && "focus" in tab) {
          return tab.navigate(url).then((t) => (t || tab).focus());
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
