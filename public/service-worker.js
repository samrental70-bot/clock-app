const CACHE_NAME = "clock-app-v2";

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  event.respondWith(fetch(event.request));
});

self.addEventListener("push", (event) => {
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch {
      data = {};
    }
  }
  const title = data.title || "Clock App";
  const body = data.body || "";
  const tag = data.id != null && data.id !== "" ? String(data.id) : "clock-app";
  const targetUrl = typeof data.url === "string" && data.url.length > 0 ? data.url : "/";
  const options = {
    body,
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag,
    data: { url: targetUrl },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const rawUrl = event.notification.data && event.notification.data.url;
  const urlToOpen = typeof rawUrl === "string" && rawUrl.length > 0 ? rawUrl : "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUnfocused: true }).then((clientList) => {
      for (let i = 0; i < clientList.length; i++) {
        const client = clientList[i];
        if ("focus" in client && client.focus) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(urlToOpen);
      }
      return Promise.resolve();
    })
  );
});