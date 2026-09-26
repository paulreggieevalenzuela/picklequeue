// Minimal service worker: lets installed PWAs show "You're up" notifications.
// Web Push (server-sent) is added with cloud sync in a later phase.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window" }).then((list) => {
      const open = list.find((c) => c.url.endsWith(url));
      return open ? open.focus() : self.clients.openWindow(url);
    }),
  );
});
