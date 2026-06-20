"use client";

import { useEffect } from "react";

export function PwaRegistration() {
  useEffect(() => {
    if ((window as Window & { __SNCF_DISABLE_PWA_SW?: boolean }).__SNCF_DISABLE_PWA_SW) return;
    if (!("serviceWorker" in navigator)) return;
    if (
      window.location.protocol !== "https:" &&
      window.location.hostname !== "localhost" &&
      window.location.hostname !== "127.0.0.1"
    ) return;

    void navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .then((registration) => registration.update())
      .catch(() => {
        // La PWA reste utilisable sans service worker.
      });
  }, []);

  return null;
}
