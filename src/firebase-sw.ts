/// <reference lib="webworker" />
import { initializeApp, type FirebaseOptions } from "firebase/app";
import { getMessaging, onBackgroundMessage } from "firebase/messaging/sw";
declare const __FIREBASE_CONFIG__: FirebaseOptions;
declare const self: ServiceWorkerGlobalScope;
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) =>
  event.waitUntil(self.clients.claim()),
);
// Install before Firebase initializes; notification contains no private access key.
self.addEventListener("notificationclick", (event) => {
  event.stopImmediatePropagation();
  event.notification.close();
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        const existing = clients.find((client) =>
          client.url.startsWith(self.registration.scope),
        );
        return existing
          ? existing.focus()
          : self.clients.openWindow(self.registration.scope);
      }),
  );
});
if (__FIREBASE_CONFIG__.projectId) {
  const messaging = getMessaging(initializeApp(__FIREBASE_CONFIG__));
  // Data-only payload avoids the automatic second notification from Firebase.
  onBackgroundMessage(messaging, (payload) =>
    self.registration.showNotification("Srdíčková pošta ♡", {
      body: "Čeká na tebe nový vzkaz.",
      icon: new URL("icon-192.png", self.registration.scope).href,
      badge: new URL("icon-192.png", self.registration.scope).href,
      tag: payload.data?.tag || "daily-love",
      data: { url: self.registration.scope },
    }),
  );
}
