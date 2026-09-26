"use client";

export function notificationsSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

export async function enableNotifications(): Promise<boolean> {
  if (!notificationsSupported()) return false;
  if ("serviceWorker" in navigator) await navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  return (await Notification.requestPermission()) === "granted";
}

/** "You're up on Court 3". Uses the service worker when available (required on Android). */
export async function notify(title: string, body: string, url: string) {
  navigator.vibrate?.([200, 100, 200]);
  if (!notificationsSupported() || Notification.permission !== "granted") return;
  const reg = "serviceWorker" in navigator ? await navigator.serviceWorker.getRegistration() : undefined;
  if (reg) await reg.showNotification(title, { body, data: { url }, icon: "/icon.svg", tag: "called" });
  else new Notification(title, { body, icon: "/icon.svg", tag: "called" });
}
