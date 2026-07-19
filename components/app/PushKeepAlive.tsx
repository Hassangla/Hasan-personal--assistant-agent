"use client";

import { useEffect } from "react";

// Heals push delivery on every app open. iOS rotates the push subscription
// periodically; without re-registration the server keeps sending to a dead
// endpoint (Apple still 201s it, so it's never pruned) and notifications go
// silently missing. On load, if permission is granted, we make sure the
// CURRENT subscription is registered server-side — re-subscribing if iOS
// rotated the old one away. Renders nothing.
export function PushKeepAlive() {
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return;
        if (Notification.permission !== "granted") return;
        const reg = await navigator.serviceWorker.register("/sw.js");
        await navigator.serviceWorker.ready;
        let sub = await reg.pushManager.getSubscription();
        if (!sub) {
          const { key } = await fetch("/api/push/public-key").then((r) => r.json());
          if (!key) return;
          sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
        }
        if (cancelled || !sub) return;
        await fetch("/api/push/subscribe", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ subscription: sub.toJSON() }),
        });
      } catch {
        /* offline or push unavailable — nothing to heal */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  return null;
}
