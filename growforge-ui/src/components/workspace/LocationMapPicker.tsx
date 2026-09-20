"use client";

import { useEffect, useState } from "react";
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Crosshair, Loader2, MapPin, X } from "lucide-react";
import type { ProfileLocation } from "@/lib/userMemory";

// A custom divIcon (inline SVG pin in the app's electric-blue) instead of
// Leaflet's default marker — the default ships as separate image files
// whose paths break under bundlers unless manually reconfigured, and this
// reads more consistently with the rest of the UI anyway.
const PIN_ICON = L.divIcon({
  className: "",
  html: `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="filter: drop-shadow(0 2px 4px rgba(0,0,0,0.35))">
    <path d="M12 0C7.03 0 3 4.03 3 9c0 6.75 9 15 9 15s9-8.25 9-15c0-4.97-4.03-9-9-9z" fill="#2563eb"/>
    <circle cx="12" cy="9" r="3.5" fill="white"/>
  </svg>`,
  iconSize: [32, 32],
  iconAnchor: [16, 32],
});

function ClickToPin({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onPick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

/** Pans/zooms the map when `target` changes — used after "Use my current
 *  location" resolves, since react-leaflet doesn't recenter on its own when
 *  the `center` prop changes post-mount. */
function FlyTo({ target }: { target: [number, number] | null }) {
  const map = useMap();
  useEffect(() => {
    if (target) map.flyTo(target, 13);
  }, [target, map]);
  return null;
}

interface LocationMapPickerProps {
  initial?: ProfileLocation;
  onConfirm: (location: ProfileLocation) => void;
  onClose: () => void;
}

/** Full-screen modal: click anywhere on an OpenStreetMap tile layer to drop
 *  a pin, confirm to reverse-geocode it into a readable label and save. No
 *  API key, no billing — OpenStreetMap's tile usage policy just asks for
 *  attribution, which the layer control below provides. */
export function LocationMapPicker({ initial, onConfirm, onClose }: LocationMapPickerProps) {
  const [picked, setPicked] = useState<{ lat: number; lng: number } | null>(
    initial ? { lat: initial.lat, lng: initial.lng } : null,
  );
  const [flyTarget, setFlyTarget] = useState<[number, number] | null>(null);
  const [resolving, setResolving] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState<string | null>(null);

  const center: [number, number] = picked ? [picked.lat, picked.lng] : [23.685, 90.3563]; // Bangladesh-centered default — matches this operator's real location, not an arbitrary null-island fallback

  function handleUseMyLocation() {
    if (!navigator.geolocation) {
      setLocateError("Your browser doesn't support geolocation.");
      return;
    }
    setLocating(true);
    setLocateError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const next: [number, number] = [pos.coords.latitude, pos.coords.longitude];
        setPicked({ lat: next[0], lng: next[1] });
        setFlyTarget(next);
        setLocating(false);
      },
      (err) => {
        setLocateError(err.code === err.PERMISSION_DENIED ? "Location permission denied." : "Couldn't get your location.");
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  async function handleConfirm() {
    if (!picked) return;
    setResolving(true);
    try {
      const res = await fetch(`/api/geo/reverse?lat=${picked.lat}&lng=${picked.lng}`);
      const data = await res.json();
      onConfirm({ label: data.label ?? `${picked.lat.toFixed(4)}, ${picked.lng.toFixed(4)}`, lat: picked.lat, lng: picked.lng });
    } catch {
      onConfirm({ label: `${picked.lat.toFixed(4)}, ${picked.lng.toFixed(4)}`, lat: picked.lat, lng: picked.lng });
    } finally {
      setResolving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-app/40 p-4 backdrop-blur-sm">
      <div className="flex w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-border-metal-strong bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-border-metal px-4 py-3">
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-electric" />
            <h2 className="font-heading text-sm font-semibold text-navy">Set your location</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close map" className="rounded-lg p-1.5 text-secondary hover:bg-sunken hover:text-navy">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex items-center justify-between gap-2 border-b border-border-metal bg-sunken px-4 py-2">
          <p className="text-xs text-secondary">Click anywhere on the map to drop a pin, then confirm.</p>
          <button
            type="button"
            onClick={handleUseMyLocation}
            disabled={locating}
            className="flex shrink-0 items-center gap-1.5 rounded-lg border border-border-metal bg-white px-2.5 py-1.5 text-[11px] font-medium text-secondary transition-colors hover:border-electric/40 hover:text-electric disabled:cursor-not-allowed disabled:opacity-60"
          >
            {locating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Crosshair className="h-3 w-3" />}
            {locating ? "Locating…" : "Use my current location"}
          </button>
        </div>
        {locateError && <p className="border-b border-border-metal bg-crimson/5 px-4 py-1.5 text-xs text-crimson">{locateError}</p>}

        <div className="h-96 w-full">
          <MapContainer center={center} zoom={picked ? 10 : 6} className="h-full w-full" scrollWheelZoom>
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <ClickToPin onPick={(lat, lng) => setPicked({ lat, lng })} />
            <FlyTo target={flyTarget} />
            {picked && <Marker position={[picked.lat, picked.lng]} icon={PIN_ICON} />}
          </MapContainer>
        </div>

        <div className="flex items-center justify-between border-t border-border-metal px-4 py-3">
          <p className="text-xs text-muted">
            {picked ? `${picked.lat.toFixed(4)}, ${picked.lng.toFixed(4)}` : "No pin dropped yet"}
          </p>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!picked || resolving}
            className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-electric to-gold px-4 py-2 text-xs font-semibold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
          >
            {resolving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MapPin className="h-3.5 w-3.5" />}
            {resolving ? "Looking up…" : "Use this location"}
          </button>
        </div>
      </div>
    </div>
  );
}
