// Push event handler — shown when the page is closed/backgrounded.
self.addEventListener("push", (event) => {
  if (!event.data) return;
  let data = {};
  try { data = event.data.json(); } catch { data = { title: "FundedNG", body: event.data.text() }; }
  const title = data.title || "FundedNG";
  const options = {
    body: data.body || "",
    icon: "/favicon.png",
    badge: "/favicon-32.png",
    data: { url: data.url || "/dashboard" },
  };
  event.waitUntil(
    (async () => {
      await self.registration.showNotification(title, options);
      try {
        // Show a badge on the app icon — the client will correct it with the
        // real unread count when the user opens the app.
        await self.registration.setAppBadge(1);
      } catch { /* badge API unsupported */ }
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  event.waitUntil(
    (async () => {
      try { await self.registration.clearAppBadge(); } catch { /* noop */ }
      const wins = await clients.matchAll({ type: "window" });
      for (const c of wins) {
        if ("focus" in c) return c.focus();
      }
      return clients.openWindow(url);
    })(),
  );
});