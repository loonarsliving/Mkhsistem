// MK Connect service worker — Web Push only. No asset caching / offline
// support here; that's handled elsewhere in the app (see lib/native for the
// Capacitor native shell's own offline handling). This worker's only job is
// receiving push events while the browser (or even the tab) is closed and
// routing a click on the resulting OS notification back into the app.

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "MK Connect", body: event.data.text() };
  }

  // Refund customer chat (0287): show it like a WhatsApp message -- the
  // sender as the title ("Pesan dari ...") and the message itself as the
  // body -- instead of the generic "MK Connect" + title.
  const isRefundChat = payload.category === "refund_customer_message";
  const title = isRefundChat ? payload.body || "Pesan customer refund" : payload.title || "MK Connect";
  const body = isRefundChat ? payload.detail || "" : payload.body || "";
  const link = payload.link || "/notifications";

  // Home-screen icon badge (refund chat unread count, see /api/push/send).
  // setAppBadge exists on iOS 16.4+ home-screen apps and installed PWAs;
  // elsewhere it's simply skipped.
  const badgeUpdate =
    typeof payload.badge === "number" && self.navigator && "setAppBadge" in self.navigator
      ? (payload.badge > 0 ? self.navigator.setAppBadge(payload.badge) : self.navigator.clearAppBadge()).catch(() => {})
      : Promise.resolve();

  event.waitUntil(
    Promise.all([badgeUpdate, self.registration.showNotification(title, {
      body,
      icon: "/images/icon-192.png",
      badge: "/images/icon-192.png",
      timestamp: payload.timestamp || Date.now(),
      tag: payload.notificationId || undefined,
      data: { link },
    })]),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const link = event.notification.data?.link || "/notifications";

  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const targetUrl = new URL(link, self.registration.scope).href;

      for (const client of allClients) {
        if ("focus" in client) {
          await client.focus();
          if ("navigate" in client) await client.navigate(targetUrl);
          return;
        }
      }
      await self.clients.openWindow(targetUrl);
    })(),
  );
});
