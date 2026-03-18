"use client";

import { useEffect } from "react";

export function PwaRegister() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }

    const isDevHost =
      window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1";

    if (isDevHost) {
      // In local development we fully disable SW to avoid stale caches hiding CSS changes.
      void navigator.serviceWorker.getRegistrations().then((registrations) => {
        registrations.forEach((registration) => {
          void registration.unregister();
        });
      });

      if ("caches" in window) {
        void caches.keys().then((keys) => {
          keys.forEach((key) => {
            void caches.delete(key);
          });
        });
      }

      return;
    }

    void navigator.serviceWorker.register("/sw.js").catch(() => {
      // Registration failures are non-critical for the web app.
    });
  }, []);

  return null;
}
