"use client";

import { useEffect, useId, useRef, useState } from "react";
import { decodeGooglePolyline } from "@/lib/polyline";

// Alias to avoid conflict with google.maps.Map
const JsMap = globalThis.Map;

type MapPlace = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
};

type MapStop = {
  id: string;
  kind: "dinner" | "activity";
  name: string;
  latitude: number | null;
  longitude: number | null;
};

type MapDay = {
  id: string;
  dayNumber: number;
  startPlace: MapPlace;
  endPlace: MapPlace;
  routePolyline: string | null;
  locations: Array<{
    id: string;
    sortOrder: number;
    place: MapPlace;
  }>;
  stops: MapStop[];
};

type TrackerPoint = {
  id: string;
  latitude: number;
  longitude: number;
  source: "auto" | "checkin";
  note: string | null;
  cityName: string | null;
  stateCode: string | null;
};

type TripMapProps = {
  days: MapDay[];
  hotDogPlaces: Array<{
    id: string;
    name: string;
    address: string | null;
    latitude: number;
    longitude: number;
    dayNumber: number;
  }>;
  trackPoints?: TrackerPoint[];
  centerOn?: { lat: number; lng: number } | null;
  selectedDayNumber: number;
  currentDayNumber: number;
  onSelectDay: (dayNumber: number) => void;
  canEdit?: boolean;
};

function getDayRoutePlaces(day: MapDay) {
  return day.locations.length ? day.locations.map((location) => location.place) : [day.endPlace];
}

function getTripRoutePlaces(days: MapDay[], selectedDayNumber?: number) {
  if (!days.length) {
    return [];
  }

  const limitedDays = typeof selectedDayNumber === "number" ? days.filter((day) => day.dayNumber <= selectedDayNumber) : days;
  if (!limitedDays.length) {
    return [];
  }

  const routePlaces: MapPlace[] = [days[0].startPlace];
  for (const day of limitedDays) {
    routePlaces.push(...getDayRoutePlaces(day));
  }

  return routePlaces.filter(
    (place, index, values) =>
      index === 0 ||
      place.id !== values[index - 1]?.id ||
      place.latitude !== values[index - 1]?.latitude ||
      place.longitude !== values[index - 1]?.longitude
  );
}

function getPolylinePoints(day: MapDay) {
  if (!day.routePolyline) {
    return null;
  }

  return decodeGooglePolyline(day.routePolyline).map(([latitude, longitude]) => ({ lat: latitude, lng: longitude }));
}

function getSelectedDayViewportPoints(day: MapDay) {
  const polylinePoints = getPolylinePoints(day);
  if (polylinePoints?.length) {
    return polylinePoints;
  }

  return getDayRoutePlaces(day).map((place) => ({ lat: place.latitude, lng: place.longitude }));
}

let googleMapsPromise: Promise<void> | null = null;

function loadGoogleMaps(): Promise<void> {
  if (googleMapsPromise) return googleMapsPromise;

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

type MapInstance = {
  map: google.maps.Map;
  baseRoute: google.maps.Polyline;
  activeRoute: google.maps.Polyline;
  trackerRoute: google.maps.Polyline;
  trackerMarkers: google.maps.Marker[];
  markers: globalThis.Map<string, google.maps.Marker>;
  activityMarkers: globalThis.Map<string, google.maps.Marker>;
  hotDogMarkers: globalThis.Map<string, google.maps.Marker>;
  liveMarker: google.maps.Marker | null;
  infoWindow: google.maps.InfoWindow;
};

function circleSvgUrl(fill: string, border: string, size: number) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2 - 2}" fill="${fill}" stroke="${border}" stroke-width="2"/></svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function activitySvgUrl(selected: boolean) {
  const sz = selected ? 18 : 14;
  const fill = selected ? "#c62839" : "#e8a735";
  const shadow = selected ? "rgba(198,40,57,0.4)" : "rgba(0,0,0,0.3)";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${sz + 4}" height="${sz + 4}"><defs><filter id="s"><feDropShadow dx="0" dy="1" stdDeviation="1" flood-color="${shadow}"/></filter></defs><rect x="${(sz + 4) / 2 - sz / 2}" y="${(sz + 4) / 2 - sz / 2}" width="${sz}" height="${sz}" rx="3" fill="${fill}" stroke="#ffffff" stroke-width="2" transform="rotate(45 ${(sz + 4) / 2} ${(sz + 4) / 2})" filter="url(#s)"/></svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function getHotDogIcon(zoom?: number) {
  const normalizedZoom = typeof zoom === "number" ? zoom : 6;
  const size = Math.max(36, Math.min(64, Math.round(18 + normalizedZoom * 2)));

  return {
    url: "/hot_dog.png",
    scaledSize: new google.maps.Size(size, size),
    anchor: new google.maps.Point(size / 2, size / 2)
  };
}

export function TripMap({ days, hotDogPlaces, trackPoints, centerOn, selectedDayNumber, currentDayNumber, onSelectDay, canEdit }: TripMapProps) {
  const containerId = useId().replace(/:/g, "");
  const mapRef = useRef<HTMLDivElement | null>(null);
  const [livePosition, setLivePosition] = useState<{ latitude: number; longitude: number } | null>(null);
  const initializingRef = useRef(false);
  const instanceRef = useRef<MapInstance | null>(null);

  useEffect(() => {
    if (!canEdit || !navigator.geolocation) return;

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        setLivePosition({ latitude: position.coords.latitude, longitude: position.coords.longitude });
      },
      () => setLivePosition(null),
      { enableHighAccuracy: true, maximumAge: 60000, timeout: 10000 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [canEdit]);

  useEffect(() => {
    let mounted = true;

    async function load() {
      const container = mapRef.current;
      if (!mounted || !container || instanceRef.current || initializingRef.current) return;

      initializingRef.current = true;
      await loadGoogleMaps();
      if (!mounted) {
        initializingRef.current = false;
        return;
      }

      const map = new google.maps.Map(container, {
        center: { lat: 39.8283, lng: -98.5795 },
        zoom: 4,
        gestureHandling: "greedy",
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false
      });

      const infoWindow = new google.maps.InfoWindow();

      // Base route polyline
      const routeSegments = days.map((day) => getPolylinePoints(day)).filter((points): points is google.maps.LatLngLiteral[] => Boolean(points?.length));
      const routePoints = routeSegments.length
        ? routeSegments.flatMap((segment, index) => (index === 0 ? segment : segment.slice(1)))
        : getTripRoutePlaces(days).map((place) => ({ lat: place.latitude, lng: place.longitude }));

      const baseRoute = new google.maps.Polyline({
        path: routePoints,
        strokeColor: "#3d679e",
        strokeWeight: 6,
        strokeOpacity: 1,
        geodesic: true,
        map
      });

      // Center on selected day's first location
      const initialDay = days.find((day) => day.dayNumber === selectedDayNumber) ?? days[0];
      if (initialDay) {
        const firstPlace = initialDay.locations.length ? initialDay.locations[0].place : initialDay.startPlace;
        map.setCenter({ lat: firstPlace.latitude, lng: firstPlace.longitude });
        map.setZoom(11);
      } else if (routePoints.length) {
        const bounds = new google.maps.LatLngBounds();
        routePoints.forEach((point) => bounds.extend(point));
        map.fitBounds(bounds, { top: 36, right: 36, bottom: 36, left: 36 });
      }

      // Active route polyline
      const activeRoute = new google.maps.Polyline({
        path: [],
        strokeColor: "#c62839",
        strokeWeight: 8,
        strokeOpacity: 1,
        geodesic: true,
        map
      });

      const hotDogMarkers = new JsMap<string, google.maps.Marker>();
      const updateHotDogIcons = () => {
        const icon = getHotDogIcon(map.getZoom());
        hotDogMarkers.forEach((marker) => marker.setIcon(icon));
      };

      hotDogPlaces.forEach((place) => {
        const marker = new google.maps.Marker({
          map,
          position: { lat: place.latitude, lng: place.longitude },
          title: place.name,
          icon: getHotDogIcon(map.getZoom())
        });

        marker.addListener("click", () => {
          infoWindow.setContent(`<strong>${place.name}</strong>${place.address ? `<br/>${place.address}` : ""}<br/>Day ${place.dayNumber}`);
          infoWindow.open({ anchor: marker, map });
          onSelectDay(place.dayNumber);
        });

        hotDogMarkers.set(place.id, marker);
      });

      map.addListener("zoom_changed", updateHotDogIcons);
      updateHotDogIcons();

      // Location markers
      const uniquePlaces = Array.from(
        new JsMap(
          getTripRoutePlaces(days)
            .concat(days.flatMap((day) => day.locations.map((location) => location.place)))
            .map((place) => [place.id, place] as [string, MapPlace])
        ).values()
      );

      const markers = new JsMap<string, google.maps.Marker>();
      uniquePlaces.forEach((place) => {
        const marker = new google.maps.Marker({
          map,
          position: { lat: place.latitude, lng: place.longitude },
          title: place.name,
          icon: {
            url: circleSvgUrl("#ffffff", "rgba(16, 35, 63, 0.38)", 14),
            scaledSize: new google.maps.Size(14, 14),
            anchor: new google.maps.Point(7, 7)
          }
        });

        marker.addListener("click", () => {
          infoWindow.setContent(`<strong>${place.name}</strong><br/>Jump to the nearest trip day.`);
          infoWindow.open({ anchor: marker, map });

          const nearest = days.find(
            (day) =>
              day.startPlace.id === place.id ||
              day.endPlace.id === place.id ||
              day.locations.some((location) => location.place.id === place.id)
          );
          if (nearest) onSelectDay(nearest.dayNumber);
        });

        markers.set(place.id, marker);
      });

      // Activity/dinner markers
      const activityMarkers = new JsMap<string, google.maps.Marker>();
      days.forEach((day) => {
        day.stops.forEach((stop) => {
          if (!stop.latitude || !stop.longitude || activityMarkers.has(stop.id)) return;

          const sz = 14;
          const marker = new google.maps.Marker({
            map,
            position: { lat: stop.latitude, lng: stop.longitude },
            title: stop.name,
            icon: {
              url: activitySvgUrl(false),
              scaledSize: new google.maps.Size(sz + 4, sz + 4),
              anchor: new google.maps.Point((sz + 4) / 2, (sz + 4) / 2)
            }
          });

          marker.addListener("click", () => {
            infoWindow.setContent(
              `<strong>${stop.name}</strong><br/><em>${stop.kind === "dinner" ? "Dinner" : "Activity"}</em><br/>Day ${day.dayNumber}`
            );
            infoWindow.open({ anchor: marker, map });
            onSelectDay(day.dayNumber);
          });

          activityMarkers.set(stop.id, marker);
        });
      });

      // Tracker overlay
      const trackerRoute = new google.maps.Polyline({
        path: (trackPoints ?? []).map((p) => ({ lat: p.latitude, lng: p.longitude })),
        strokeColor: "#c62839",
        strokeWeight: 3,
        strokeOpacity: 0.85,
        geodesic: true,
        map
      });

      const trackerMarkers: google.maps.Marker[] = [];
      (trackPoints ?? []).filter((p) => p.source === "checkin").forEach((p) => {
        const marker = new google.maps.Marker({
          map,
          position: { lat: p.latitude, lng: p.longitude },
          title: [p.cityName, p.stateCode].filter(Boolean).join(", ") || "Check-in",
          icon: { url: "/rv.png", scaledSize: new google.maps.Size(44, 24), anchor: new google.maps.Point(22, 24) }
        });
        marker.addListener("click", () => {
          infoWindow.setContent(
            [
              `<strong>${[p.cityName, p.stateCode].filter(Boolean).join(", ") || "Check-in"}</strong>`,
              p.note ? `<em>${p.note}</em>` : null
            ].filter(Boolean).join("<br/>")
          );
          infoWindow.open({ map, anchor: marker });
        });
        trackerMarkers.push(marker);
      });

      if (!mounted) {
        initializingRef.current = false;
        return;
      }

      instanceRef.current = { map, baseRoute, activeRoute, trackerRoute, trackerMarkers, markers, activityMarkers, hotDogMarkers, liveMarker: null, infoWindow };
      initializingRef.current = false;
    }

    load();

    return () => {
      mounted = false;
      if (instanceRef.current) {
        instanceRef.current.baseRoute.setMap(null);
        instanceRef.current.activeRoute.setMap(null);
        instanceRef.current.trackerRoute.setMap(null);
        instanceRef.current.trackerMarkers.forEach((m) => m.setMap(null));
        instanceRef.current.markers.forEach((m) => m.setMap(null));
        instanceRef.current.activityMarkers.forEach((m) => m.setMap(null));
        instanceRef.current.hotDogMarkers.forEach((m) => m.setMap(null));
        if (instanceRef.current.liveMarker) instanceRef.current.liveMarker.setMap(null);
        instanceRef.current = null;
      }
      initializingRef.current = false;
    };
  }, [days, onSelectDay]);

  // Update on selected day change
  useEffect(() => {
    const instance = instanceRef.current;
    if (!instance || !days.length) return;

    const selectedDay = days.find((day) => day.dayNumber === selectedDayNumber) ?? days[0];
    const activePoints = getSelectedDayViewportPoints(selectedDay);
    instance.activeRoute.setPath(activePoints);

    const selectedDays = days.filter((day) => day.dayNumber === selectedDayNumber);
    const selectedPlaces = new Set(
      selectedDays.flatMap((day) => [day.startPlace, ...getDayRoutePlaces(day)]).map((place) => place.id)
    );
    const currentDays = days.filter((day) => day.dayNumber === currentDayNumber);
    const currentPlaces = new Set(
      currentDays.flatMap((day) => [day.startPlace, ...getDayRoutePlaces(day)]).map((place) => place.id)
    );

    instance.markers.forEach((marker, placeId) => {
      const isSelected = selectedPlaces.has(placeId);
      const isCurrent = currentPlaces.has(placeId);
      const size = isSelected ? 18 : isCurrent ? 16 : 14;
      const fill = isSelected ? "#c62839" : isCurrent ? "#1d4f8f" : "#ffffff";
      const border = isSelected ? "#ffffff" : isCurrent ? "#c62839" : "rgba(16, 35, 63, 0.38)";
      marker.setIcon({
        url: circleSvgUrl(fill, border, size),
        scaledSize: new google.maps.Size(size, size),
        anchor: new google.maps.Point(size / 2, size / 2)
      });
    });

    const selectedStopIds = new Set(selectedDays.flatMap((day) => day.stops.map((stop) => stop.id)));
    instance.activityMarkers.forEach((marker, stopId) => {
      const selected = selectedStopIds.has(stopId);
      const sz = selected ? 18 : 14;
      marker.setIcon({
        url: activitySvgUrl(selected),
        scaledSize: new google.maps.Size(sz + 4, sz + 4),
        anchor: new google.maps.Point((sz + 4) / 2, (sz + 4) / 2)
      });
    });

    const dayPoints = getSelectedDayViewportPoints(selectedDay);
    if (dayPoints.length > 1) {
      const dayBounds = new google.maps.LatLngBounds();
      dayPoints.forEach((point) => dayBounds.extend(point));
      if (!dayBounds.isEmpty()) {
        instance.map.fitBounds(dayBounds, { top: 40, right: 40, bottom: 40, left: 40 });
      }
    } else {
      const firstLocation = selectedDay.locations.length ? selectedDay.locations[0].place : selectedDay.startPlace;
      instance.map.setCenter({ lat: firstLocation.latitude, lng: firstLocation.longitude });
      instance.map.setZoom(12);
    }
  }, [days, hotDogPlaces, selectedDayNumber, currentDayNumber]);

  // Pan to specified location (tracker tab)
  useEffect(() => {
    const instance = instanceRef.current;
    if (!instance || !centerOn) return;
    instance.map.panTo(centerOn);
    instance.map.setZoom(12);
  }, [centerOn]);

  // Live position
  useEffect(() => {
    const instance = instanceRef.current;
    if (!instance) return;

    if (livePosition) {
      const pos = { lat: livePosition.latitude, lng: livePosition.longitude };
      if (!instance.liveMarker) {
        const marker = new google.maps.Marker({
          map: instance.map,
          position: pos,
          title: "Your current location",
          icon: {
            url: circleSvgUrl("#1d4f8f", "#ffffff", 16),
            scaledSize: new google.maps.Size(16, 16),
            anchor: new google.maps.Point(8, 8)
          }
        });
        instance.liveMarker = marker;
      } else {
        instance.liveMarker.setPosition(pos);
      }
    } else if (instance.liveMarker) {
      instance.liveMarker.setMap(null);
      instance.liveMarker = null;
    }
  }, [livePosition]);

  return <div id={containerId} ref={mapRef} className="trip-map" aria-label="Interactive RV route map" />;
}
