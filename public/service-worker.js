self.addEventListener("install", () => {
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
  const notificationId = data.notificationId || data.id || "";
  const type = typeof data.type === "string" ? data.type : "";
  if (type === "schedule_assigned") {
    console.log("[SW] push received type schedule_assigned", notificationId);
  }
  const tag =
    typeof data.tag === "string" && data.tag.length > 0
      ? data.tag
      : notificationId
        ? String(notificationId)
        : "clock-app";
  const targetUrl = typeof data.url === "string" && data.url.length > 0 ? data.url : "/";
  const isDevelopmentApp = self.location.hostname.includes("development");
  const appIcon = isDevelopmentApp ? "/icon-development-192.png" : "/icon-192.png";
  const options = {
    body,
    icon: appIcon,
    badge: appIcon,
    tag,
    data: { url: targetUrl, notificationId, type },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const notificationData = event.notification.data || {};
  const rawUrl = notificationData.url;
  const urlToOpen = typeof rawUrl === "string" && rawUrl.length > 0 ? rawUrl : "/";
  const message = {
    type: notificationData.type === "schedule_assigned" ? "OPEN_SCHEDULE" : "NOTIFICATION_CLICK",
    notificationId: notificationData.notificationId || "",
    notificationType: notificationData.type || "",
  };
  if (notificationData.type === "schedule_assigned") {
    console.log("[SW] notification click schedule_assigned", notificationData.notificationId || "");
  }

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUnfocused: true }).then((clientList) => {
      for (let i = 0; i < clientList.length; i++) {
        const client = clientList[i];
        if ("focus" in client && client.focus) {
          if (client.postMessage) client.postMessage(message);
          if (urlToOpen !== "/" && "navigate" in client && client.navigate) {
            return client.navigate(urlToOpen).then((navigatedClient) => {
              if (navigatedClient && "focus" in navigatedClient) return navigatedClient.focus();
              return client.focus();
            });
          }
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
