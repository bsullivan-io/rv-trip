"use client";

import { useEffect, useId, useRef } from "react";

type TrackerPoint = {
  id: string;
  latitude: number;
  longitude: number;
  recordedAt: string;
  source: "auto" | "checkin";
  label: string;
  note: string | null;
  stateName: string | null;
  dayNumber: number | null;
};

type TrackerMapProps = {
  points: TrackerPoint[];
};

function isHotDogCheckIn(note: string | null) {
  if (!note) return false;
  const lower = note.toLowerCase();
  return lower.includes("hot dog") || lower.includes("hotdog");
}

function checkinIcon(note: string | null) {
  if (isHotDogCheckIn(note)) {
    return { url: "/hot_dog.png", scaledSize: new google.maps.Size(28, 28), anchor: new google.maps.Point(14, 14) };
  }
  return { url: "/rv.png", scaledSize: new google.maps.Size(22, 12), anchor: new google.maps.Point(11, 12) };
}

let googleMapsPromise: Promise<void> | null = null;

function loadGoogleMaps(): Promise<void> {
  if (googleMapsPromise) {
    return googleMapsPromise;
  }

  googleMapsPromise = new Promise((resolve, reject) => {
    if (window.google?.maps) {
      resolve();
      return;
    }

    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}`;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Google Maps"));
    document.head.appendChild(script);
  });

  return googleMapsPromise;
}

async function snapToRoads(
  points: TrackerPoint[]
): Promise<Array<{ lat: number; lng: number }>> {
  const rawPath = points.map((p) => ({ lat: p.latitude, lng: p.longitude }));
  try {
    const step = Math.max(1, Math.ceil(points.length / 100));
    const sampled = points.filter((_, i) => i % step === 0);
    const pathParam = sampled.map((p) => `${p.latitude},${p.longitude}`).join("|");
    const res = await fetch(
      `https://roads.googleapis.com/v1/snapToRoads?path=${pathParam}&interpolate=true&key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}`
    );
    const data = (await res.json()) as {
      snappedPoints?: Array<{ location: { latitude: number; longitude: number } }>;
    };
    const snapped = data.snappedPoints ?? [];
    if (snapped.length > 0) {
      return snapped.map((sp) => ({ lat: sp.location.latitude, lng: sp.location.longitude }));
    }
  } catch {
    // fall through to raw path
  }
  return rawPath;
}

function formatTrackerTimestamp(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

export function TrackerMap({ points }: TrackerMapProps) {
  const containerId = useId().replace(/:/g, "");
  const mapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let disposed = false;
    let polyline: google.maps.Polyline | null = null;
    const markers: google.maps.Marker[] = [];

    async function init() {
      if (!mapRef.current || !points.length) {
        return;
      }

      await loadGoogleMaps();
      if (disposed || !mapRef.current) {
        return;
      }

      const map = new google.maps.Map(mapRef.current, {
        center: { lat: points[0]!.latitude, lng: points[0]!.longitude },
        zoom: 7,
        gestureHandling: "greedy",
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false
      });

      // Draw initial raw path immediately, then replace with snapped path
      const rawPath = points.map((p) => ({ lat: p.latitude, lng: p.longitude }));
      polyline = new google.maps.Polyline({
        path: rawPath,
        strokeColor: "#c62839",
        strokeWeight: 7,
        strokeOpacity: 0.95,
        geodesic: true,
        map
      });

      const bounds = new google.maps.LatLngBounds();
      rawPath.forEach((point) => bounds.extend(point));
      if (!bounds.isEmpty()) {
        map.fitBounds(bounds, 36);
      }

      // Replace path with road-snapped version once available
      snapToRoads(points).then((snappedPath) => {
        if (!disposed && polyline) {
          polyline.setPath(snappedPath);
        }
      });

      const infoWindow = new google.maps.InfoWindow();

      points.filter((point) => point.source === "checkin" && point.note).forEach((point) => {
        const marker = new google.maps.Marker({
          map,
          position: { lat: point.latitude, lng: point.longitude },
          title: point.label,
          icon: checkinIcon(point.note)
        });

        marker.addListener("click", () => {
          infoWindow.setContent(
            [
              `<strong>${point.label}</strong>`,
              `Day ${point.dayNumber ?? "?"}`,
              formatTrackerTimestamp(point.recordedAt),
              point.stateName ?? null,
              point.note ? `<em>${point.note}</em>` : null
            ]
              .filter(Boolean)
              .join("<br/>")
          );
          infoWindow.open({ map, anchor: marker });
        });

        markers.push(marker);
      });
    }

    void init();

    return () => {
      disposed = true;
      polyline?.setMap(null);
      markers.forEach((marker) => marker.setMap(null));
    };
  }, [points]);

  if (!points.length) {
    return <div className="tracker-map-empty">No tracker points recorded yet.</div>;
  }

  return <div id={containerId} ref={mapRef} className="tracker-map" />;
}
