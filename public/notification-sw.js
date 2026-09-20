self.addEventListener("notificationclick", (event) => {
  const data = event.notification && event.notification.data ? event.notification.data : {};
  if (data.source !== "swarm-studio") return;
  event.notification.close();
  const targetUrl = data.url || self.registration.scope;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const targetOrigin = new URL(targetUrl, self.location.origin).origin;
    const existing = windows.find((client) => {
      try { return new URL(client.url).origin === targetOrigin; } catch { return false; }
    });
    if (existing && "focus" in existing) {
      await existing.focus();
      return;
    }
    if (self.clients.openWindow) await self.clients.openWindow(targetUrl);
  })());
});
