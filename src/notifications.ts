import { initializeApp, getApps, type FirebaseOptions } from "firebase/app";
import {
  getMessaging,
  getToken,
  isSupported,
  onMessage,
  deleteToken,
} from "firebase/messaging";
import { callLink } from "./access";
const config: FirebaseOptions = JSON.parse(
  import.meta.env.VITE_FIREBASE_CONFIG || "{}",
);
function messaging() {
  if (
    !config.projectId ||
    !config.apiKey ||
    !config.appId ||
    !config.messagingSenderId
  )
    throw new Error("Chybí Firebase konfigurace.");
  return getMessaging(getApps()[0] ?? initializeApp(config));
}
export async function enableNotifications(key: string) {
  if (!("Notification" in window) || !(await isSupported()))
    throw new Error("Tento prohlížeč nepodporuje oznámení.");
  const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;
  if (!vapidKey) throw new Error("Chybí Firebase VAPID klíč.");
  if ((await Notification.requestPermission()) !== "granted")
    throw new Error("Povol oznámení v nastavení prohlížeče.");
  await registerDevice(key, vapidKey);
}
async function registerDevice(key: string, vapidKey: string) {
  const registration = await navigator.serviceWorker.ready;
  // Replace a subscription created by the old non-Firebase Web Push implementation.
  const existing = await registration.pushManager.getSubscription();
  const oldKey = existing?.options.applicationServerKey;
  const expected = Uint8Array.from(
    atob(vapidKey.replace(/-/g, "+").replace(/_/g, "/")),
    (c) => c.charCodeAt(0),
  );
  if (
    existing &&
    oldKey &&
    (oldKey.byteLength !== expected.length ||
      new Uint8Array(oldKey).some((byte, i) => byte !== expected[i]))
  ) {
    await existing.unsubscribe();
  }
  const token = await getToken(messaging(), {
    vapidKey,
    serviceWorkerRegistration: registration,
  });
  if (!token) throw new Error("Nepodařilo se získat token telefonu.");
  await callLink("save_fcm_token", key, { p_fcm_token: token });
  localStorage.setItem("love-fcm-token", token);
}
export async function startNotifications(key: string): Promise<() => void> {
  if (
    !("Notification" in window) ||
    !config.projectId ||
    !(await isSupported())
  )
    return () => {};
  if (
    Notification.permission === "granted" &&
    import.meta.env.VITE_FIREBASE_VAPID_KEY
  ) {
    await registerDevice(key, import.meta.env.VITE_FIREBASE_VAPID_KEY);
  }
  return onMessage(messaging(), async (payload) => {
    if (Notification.permission !== "granted") return;
    const registration = await navigator.serviceWorker.ready;
    await registration.showNotification("Srdíčková pošta ♡", {
      body: "Čeká na tebe nový vzkaz.",
      icon: `${import.meta.env.BASE_URL}icon-192.png`,
      tag: payload.data?.tag || "daily-love",
      data: { url: registration.scope },
    });
  });
}
export async function disableNotifications(key: string) {
  const token = localStorage.getItem("love-fcm-token");
  if (token) {
    await callLink("remove_fcm_token", key, { p_fcm_token: token });
    if (await isSupported()) await deleteToken(messaging());
    localStorage.removeItem("love-fcm-token");
  }
}
