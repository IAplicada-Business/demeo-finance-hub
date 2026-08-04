// Aurora · Service Worker

const CACHE_NAME = "aurora-v1";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(clients.claim());
});

self.addEventListener("push", (event) => {
  const data = event.data?.json() ?? {};
  const title = data.title ?? "Aurora";
  const options = {
    body: data.body ?? "",
    icon: "/brand/aurora-favicon.svg",
    badge: "/brand/aurora-favicon.svg",
    data: { url: data.url ?? "/admin/pendentes" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      const target = event.notification.data?.url ?? "/admin/pendentes";
      for (const client of list) {
        if (client.url.includes(target) && "focus" in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(target);
    }),
  );
});
