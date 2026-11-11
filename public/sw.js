self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) =>
  event.waitUntil(self.clients.claim()),
);
self.addEventListener("push", (event) => {
  const data = event.data?.json() || {};
  event.waitUntil(
    self.registration.showNotification("Srdíčková pošta ♡", {
      body: "Čeká na tebe nový vzkaz. Jen pro tebe.",
      icon: "icon-192.png",
      badge: "icon-192.png",
      tag: data.tag || "daily-love",
      data: { url: self.registration.scope },
    }),
  );
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then(async (clients) => {
        const existing = clients.find((client) =>
          client.url.startsWith(self.registration.scope),
        );
        if (existing) return existing.focus();
        return self.clients.openWindow(self.registration.scope);
      }),
  );
});
