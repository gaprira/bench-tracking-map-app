"use client";

import { useEffect } from "react";
import L from "leaflet";
import {
  MapContainer,
  Marker,
  TileLayer,
  Tooltip,
  useMap,
  useMapEvents,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import type { BenchSummary } from "@/lib/types";

type Props = {
  benches: BenchSummary[];
  selectedId: number | null;
  draft: { lat: number; lng: number } | null;
  focus: { lat: number; lng: number; zoom?: number } | null;
  onSelect: (id: number) => void;
  onMapClick: (lat: number, lng: number) => void;
};

const benchIcon = (color: string, active: boolean) =>
  L.divIcon({
    className: "",
    html: `<div style="
      width:${active ? 40 : 32}px;height:${active ? 40 : 32}px;
      border-radius:50% 50% 50% 0;transform:rotate(-45deg);
      background:${color};border:3px solid #fff;
      box-shadow:0 3px 8px rgba(0,0,0,.35);
      display:flex;align-items:center;justify-content:center;">
      <span style="transform:rotate(45deg);font-size:${active ? 18 : 14}px;line-height:1">🪑</span>
    </div>`,
    iconSize: [active ? 40 : 32, active ? 40 : 32],
    iconAnchor: [active ? 20 : 16, active ? 40 : 32],
    tooltipAnchor: [0, active ? -40 : -32],
  });

const draftIcon = L.divIcon({
  className: "",
  html: `<div style="width:36px;height:36px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);
    background:#f59e0b;border:3px dashed #fff;box-shadow:0 3px 8px rgba(0,0,0,.35);
    display:flex;align-items:center;justify-content:center;">
    <span style="transform:rotate(45deg);font-size:16px;line-height:1">➕</span></div>`,
  iconSize: [36, 36],
  iconAnchor: [18, 36],
});

function ratingColor(avg: number | null) {
  if (avg === null) return "#64748b";
  if (avg >= 4.5) return "#16a34a";
  if (avg >= 3.5) return "#65a30d";
  if (avg >= 2.5) return "#f59e0b";
  return "#dc2626";
}

function ClickHandler({ onMapClick }: { onMapClick: Props["onMapClick"] }) {
  useMapEvents({
    click(e) {
      onMapClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

function FocusHandler({ focus }: { focus: Props["focus"] }) {
  const map = useMap();
  useEffect(() => {
    if (!focus) return;
    const fly = () =>
      map.flyTo([focus.lat, focus.lng], focus.zoom ?? Math.max(map.getZoom(), 15), {
        duration: 0.8,
      });
    const container = map.getContainer();
    if (container.clientWidth > 0 && container.clientHeight > 0) {
      fly();
      return;
    }
    // Карта скрыта (на мобильных клик по скамейке во вкладке «Список»):
    // flyTo на контейнере 0×0 падает с «Invalid LatLng (NaN, NaN)».
    // Ждём, пока контейнер получит размер, и только тогда перелетаем.
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      if (container.clientWidth > 0 && container.clientHeight > 0) {
        observer.disconnect();
        map.invalidateSize();
        fly();
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [focus, map]);
  return null;
}

// Контейнер карты может скрываться (вкладки «Карта/Список» на мобильных) —
// Leaflet тогда не знает реальный размер и рисует серую пустоту.
// ResizeObserver + invalidateSize пересчитывают размер при показе контейнера.
function AutoResize() {
  const map = useMap();
  useEffect(() => {
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(map.getContainer());
    return () => observer.disconnect();
  }, [map]);
  return null;
}

export default function BenchMap({
  benches,
  selectedId,
  draft,
  focus,
  onSelect,
  onMapClick,
}: Props) {
  return (
    <MapContainer
      center={[55.751244, 37.618423]}
      zoom={12}
      className="h-full w-full"
      scrollWheelZoom
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <ClickHandler onMapClick={onMapClick} />
      <FocusHandler focus={focus} />
      <AutoResize />

      {benches
        .filter((b) => Number.isFinite(b.lat) && Number.isFinite(b.lng))
        .map((b) => (
        <Marker
          key={b.id}
          position={[b.lat, b.lng]}
          icon={benchIcon(ratingColor(b.avgRating), b.id === selectedId)}
          eventHandlers={{
            click: (e) => {
              L.DomEvent.stopPropagation(e);
              onSelect(b.id);
            },
          }}
        >
          <Tooltip direction="top">
            <div className="text-sm">
              <div className="font-semibold">{b.title}</div>
              <div className="text-slate-600">
                {b.avgRating !== null
                  ? `★ ${b.avgRating.toFixed(1)} · ${b.reviewCount} отз.`
                  : "Пока без оценок"}
              </div>
            </div>
          </Tooltip>
        </Marker>
      ))}

      {draft && Number.isFinite(draft.lat) && Number.isFinite(draft.lng) && (
        <Marker position={[draft.lat, draft.lng]} icon={draftIcon} />
      )}
    </MapContainer>
  );
}
