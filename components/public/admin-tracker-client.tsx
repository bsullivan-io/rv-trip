"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

type AdminTrackerClientProps = {
  enabled: boolean;
};

const STORAGE_KEY = "rv-trip-active-slug";

export function AdminTrackerClient({ enabled }: AdminTrackerClientProps) {
  const pathname = usePathname();
  const lastSentAtRef = useRef(0);

  useEffect(() => {
    const match = pathname.match(/^\/trips\/([^/]+)/);
    if (match?.[1]) {
      window.localStorage.setItem(STORAGE_KEY, decodeURIComponent(match[1]));
    }
  }, [pathname]);

  useEffect(() => {
    if (!enabled || !navigator.geolocation) {
      return;
    }

    const match = pathname.match(/^\/trips\/([^/]+)/);
    const currentSlug = match?.[1] ? decodeURIComponent(match[1]) : window.localStorage.getItem(STORAGE_KEY);

    if (!currentSlug) {
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      async (position) => {
        const now = Date.now();
        if (now - lastSentAtRef.current < 8000) {
          return;
        }

        lastSentAtRef.current = now;

        await fetch("/api/tracker", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            tripSlug: currentSlug,
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            source: "auto"
          })
        }).catch(() => undefined);
      },
      () => undefined,
      { enableHighAccuracy: true, maximumAge: 30000, timeout: 10000 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [enabled, pathname]);

  return null;
}
