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
  return { url: "/rv.png", scaledSize: new google.maps.Size(34, 18), anchor: new google.maps.Point(17, 18) };
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

      const path = points.map((point) => ({ lat: point.latitude, lng: point.longitude }));
      polyline = new google.maps.Polyline({
        path,
        strokeColor: "#c62839",
        strokeWeight: 7,
        strokeOpacity: 0.95,
        geodesic: true,
        map
      });

      const bounds = new google.maps.LatLngBounds();
      path.forEach((point) => bounds.extend(point));
      if (!bounds.isEmpty()) {
        map.fitBounds(bounds, 36);
      }

      const infoWindow = new google.maps.InfoWindow();

      points.forEach((point) => {
        const marker = new google.maps.Marker({
          map,
          position: { lat: point.latitude, lng: point.longitude },
          title: point.label,
          icon: point.source === "checkin" && point.note
            ? checkinIcon(point.note)
            : { path: google.maps.SymbolPath.CIRCLE, scale: 4, fillColor: "#3d679e", fillOpacity: 1, strokeColor: "#ffffff", strokeWeight: 2 }
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
