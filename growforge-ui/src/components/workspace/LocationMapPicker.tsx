"use client";

import { useEffect, useState } from "react";
import { Circle, MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Compass, Crosshair, Loader2, MapPin, X } from "lucide-react";
import type { ProfileLocation, TargetMarketArea } from "@/lib/userMemory";

// A custom divIcon (inline SVG pin in the app's electric-blue) instead of
// Leaflet's default marker — the default ships as separate image files
// whose paths break under bundlers unless manually reconfigured, and this
// reads more consistently with the rest of the UI anyway.
const PIN_ICON = L.divIcon({
  className: "",
  html: `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="filter: drop-shadow(0 2px 6px rgba(0,0,0,0.5))">
    <path d="M12 0C7.03 0 3 4.03 3 9c0 6.75 9 15 9 15s9-8.25 9-15c0-4.97-4.03-9-9-9z" fill="#0078FF"/>
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
    if (target) map.flyTo(target, 12);
  }, [target, map]);
  return null;
}

export interface LocationMapPickerProps {
  mode?: "location" | "marketArea";
  initial?: ProfileLocation;
  initialMarketArea?: TargetMarketArea;
  onConfirm?: (location: ProfileLocation) => void;
  onConfirmMarketArea?: (area: TargetMarketArea) => void;
  onClose: () => void;
}

const RADIUS_PRESETS = [5, 10, 25, 50, 100];

/** Modal map picker: click anywhere on an OpenStreetMap tile layer to drop
 *  a pin or define a target market perimeter. Zero paid API keys — OpenStreetMap
 *  and Nominatim usage policy compliant. */
export function LocationMapPicker({
  mode = "location",
  initial,
  initialMarketArea,
  onConfirm,
  onConfirmMarketArea,
  onClose,
}: LocationMapPickerProps) {
  const isMarket = mode === "marketArea";

  const [picked, setPicked] = useState<{ lat: number; lng: number } | null>(() => {
    if (isMarket && initialMarketArea) {
      return { lat: initialMarketArea.lat, lng: initialMarketArea.lng };
    }
    if (initial) {
      return { lat: initial.lat, lng: initial.lng };
    }
    return null;
  });

  const [radiusKm, setRadiusKm] = useState<number>(() => {
    return initialMarketArea?.radiusKm || 10;
  });

  const [flyTarget, setFlyTarget] = useState<[number, number] | null>(null);
  const [resolving, setResolving] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState<string | null>(null);

  const center: [number, number] = picked
    ? [picked.lat, picked.lng]
    : [23.685, 90.3563]; // Default regional center

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
      const res = await fetch(
        `/api/geo/reverse?lat=${picked.lat}&lng=${picked.lng}${isMarket ? `&radiusKm=${radiusKm}&marketContext=true` : ""}`,
      );
      const data = await res.json();
      const resolvedLabel: string = data.label ?? `${picked.lat.toFixed(4)}, ${picked.lng.toFixed(4)}`;

      if (isMarket) {
        onConfirmMarketArea?.({
          label: resolvedLabel,
          lat: picked.lat,
          lng: picked.lng,
          radiusKm,
          city: data.city,
          state: data.state,
          country: data.country,
          postcode: data.postcode,
          placeType: data.placeType,
          osmPoiCount: data.osmPoiCount,
        });
      } else {
        onConfirm?.({
          label: resolvedLabel,
          lat: picked.lat,
          lng: picked.lng,
        });
      }
    } catch {
      const fallbackLabel = `${picked.lat.toFixed(4)}, ${picked.lng.toFixed(4)}`;
      if (isMarket) {
        onConfirmMarketArea?.({
          label: fallbackLabel,
          lat: picked.lat,
          lng: picked.lng,
          radiusKm,
        });
      } else {
        onConfirm?.({
          label: fallbackLabel,
          lat: picked.lat,
          lng: picked.lng,
        });
      }
    } finally {
      setResolving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4 backdrop-blur-md">
      <div className="flex w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-[#333333] bg-[#0B1220] text-white shadow-2xl">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-[#333333] px-5 py-3.5 bg-[#111c34]">
          <div className="flex items-center gap-2.5">
            {isMarket ? <Compass className="h-4 w-4 text-electric" /> : <MapPin className="h-4 w-4 text-electric" />}
            <h2 className="font-heading text-sm font-semibold text-white">
              {isMarket ? "Define Target Market Area" : "Set Your Profile Location"}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close map"
            className="rounded-lg p-1.5 text-[#94a3b8] hover:bg-[#162444] hover:text-white transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Action bar / instructions */}
        <div className="flex flex-col gap-2.5 border-b border-[#333333] bg-[#0B1220] px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-[#CCCCCC] font-inter">
            {isMarket
              ? "Click on the map to anchor your market center, then adjust the radius perimeter."
              : "Click anywhere on the map to drop a pin, then confirm."}
          </p>
          <button
            type="button"
            onClick={handleUseMyLocation}
            disabled={locating}
            className="flex shrink-0 items-center gap-1.5 rounded-xl border border-[#333333] bg-[#111c34] px-3 py-1.5 text-xs font-medium text-[#CCCCCC] transition-colors hover:border-electric hover:text-white disabled:cursor-not-allowed disabled:opacity-60 font-inter"
          >
            {locating ? <Loader2 className="h-3 w-3 animate-spin text-electric" /> : <Crosshair className="h-3 w-3 text-electric" />}
            <span>{locating ? "Locating…" : "Use current location"}</span>
          </button>
        </div>

        {locateError && (
          <p className="border-b border-crimson/30 bg-crimson/10 px-5 py-2 text-xs text-crimson font-inter">
            {locateError}
          </p>
        )}

        {/* Radius Controls (Market Area Mode) */}
        {isMarket && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#333333] bg-[#111c34]/70 px-5 py-2.5">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[#94a3b8] font-inter">Perimeter Radius:</span>
              <span className="font-heading text-xs font-bold text-electric">{radiusKm} km</span>
              <span className="text-[10px] text-[#94a3b8] font-inter">
                (~{(Math.PI * Math.pow(radiusKm, 2)).toFixed(0)} km²)
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              {RADIUS_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setRadiusKm(preset)}
                  className={`rounded-lg px-2.5 py-1 text-[11px] font-medium font-inter transition-all ${
                    radiusKm === preset
                      ? "bg-electric text-white shadow-sm"
                      : "border border-[#333333] bg-[#0B1220] text-[#CCCCCC] hover:border-electric/50 hover:text-white"
                  }`}
                >
                  {preset}km
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Map View */}
        <div className="h-96 w-full relative">
          <MapContainer center={center} zoom={picked ? (isMarket ? (radiusKm > 25 ? 9 : 11) : 10) : 6} className="h-full w-full" scrollWheelZoom>
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <ClickToPin onPick={(lat, lng) => setPicked({ lat, lng })} />
            <FlyTo target={flyTarget} />
            {picked && (
              <>
                <Marker position={[picked.lat, picked.lng]} icon={PIN_ICON} />
                {isMarket && (
                  <Circle
                    center={[picked.lat, picked.lng]}
                    radius={radiusKm * 1000}
                    pathOptions={{
                      color: "#0078FF",
                      fillColor: "#0078FF",
                      fillOpacity: 0.18,
                      weight: 2,
                    }}
                  />
                )}
              </>
            )}
          </MapContainer>
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between border-t border-[#333333] px-5 py-3.5 bg-[#111c34]">
          <p className="text-xs text-[#94a3b8] font-mono">
            {picked ? `${picked.lat.toFixed(4)}, ${picked.lng.toFixed(4)}` : "No center point pinned yet"}
          </p>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!picked || resolving}
            className="flex items-center gap-1.5 rounded-full bg-gradient-to-r from-[#0078FF] to-[#FFC432] px-5 py-2 text-xs font-bold text-white shadow-md hover:brightness-110 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60 transition-all font-inter"
          >
            {resolving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : isMarket ? <Compass className="h-3.5 w-3.5" /> : <MapPin className="h-3.5 w-3.5" />}
            <span>{resolving ? "Resolving Context…" : isMarket ? "Save Market Area →" : "Use this location"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
