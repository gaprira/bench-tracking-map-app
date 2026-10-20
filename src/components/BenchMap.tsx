"use client";

import { useEffect } from "react";
import L from "leaflet";
import {
  MapContainer,
  Marker,
  TileLayer,
  Tooltip,
  ZoomControl,
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

// Метка-табличка: цветная точка по оценке + число (как цены на картах жилья)
const benchIcon = (color: string, rating: number | null, active: boolean) =>
  L.divIcon({
    className: "",
    html: `<div class="bench-pin${active ? " bench-pin--active" : ""}" style="--pin:${color}">
      <div class="bench-pin__body"><span class="bench-pin__dot"></span>${
        rating !== null ? rating.toFixed(1) : "—"
      }</div></div>`,
    iconSize: [72, 44],
    iconAnchor: [36, 44],
    tooltipAnchor: [0, -44],
  });

const draftIcon = L.divIcon({
  className: "",
  html: `<div class="draft-pin"><span class="draft-pin__ring"></span><span class="draft-pin__core">+</span></div>`,
  iconSize: [44, 44],
  iconAnchor: [22, 22],
});

function ratingColor(avg: number | null) {
  if (avg === null) return "#a3aca5";
  if (avg >= 4.5) return "#2f9e5b";
  if (avg >= 3.5) return "#8db33a";
  if (avg >= 2.5) return "#f2a93b";
  return "#e5484d";
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
      zoomControl={false}
    >
      {/* Тайлы OSM приглушены фильтром (.leaflet-tile-pane в globals.css) под палитру сайта */}
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <ZoomControl position="bottomright" />
      <ClickHandler onMapClick={onMapClick} />
      <FocusHandler focus={focus} />
      <AutoResize />

      {benches
        .filter((b) => Number.isFinite(b.lat) && Number.isFinite(b.lng))
        .map((b) => (
        <Marker
          key={b.id}
          position={[b.lat, b.lng]}
          icon={benchIcon(ratingColor(b.avgRating), b.avgRating, b.id === selectedId)}
          eventHandlers={{
            click: (e) => {
              L.DomEvent.stopPropagation(e);
              onSelect(b.id);
            },
          }}
        >
          <Tooltip direction="top">
            <div className="text-sm">
              <div className="font-bold">{b.title}</div>
              <div className="text-white/60">
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
