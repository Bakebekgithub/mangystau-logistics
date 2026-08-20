"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { CircleMarker, GeoJSON, MapContainer, Polyline, Tooltip, useMap } from "react-leaflet";
import type { Feature, MultiPolygon } from "geojson";
import type { LatLngBoundsExpression } from "leaflet";

import regionOutline from "@/data/region.json";

export interface MapSettlement {
  id: string;
  name_ru: string;
  place: "city" | "town" | "village" | "hamlet";
  population: number | null;
  lat: number;
  lon: number;
}

export interface MapArc {
  id: string;
  from: [number, number];
  to: [number, number];
  /** Laden legs are solid, empty legs dashed — the product's core distinction. */
  laden: boolean;
  /** Relative importance, 0–1, mapped to stroke width. */
  weight?: number;
  label?: string;
  /**
   * Draw a chevron at the midpoint pointing the way the truck travels.
   *
   * Colour already carries whether a leg is paid or empty, which is the point of
   * the product and not something to give up. Direction is a second, orthogonal
   * fact, so it gets its own mark instead of a second colour scheme.
   */
  arrow?: boolean;
}

export interface MapPin {
  id: string;
  lat: number;
  lon: number;
  kind: "pickup" | "dropoff" | "vehicle";
  label?: string;
  seq?: number;
  /** Keep the label on screen without hovering. Route stops need this. */
  permanentLabel?: boolean;
}

const REGION = regionOutline as unknown as Feature<MultiPolygon>;

/**
 * Region bounds, computed once from the outline so the map always frames
 * Mangystau rather than guessing a centre and zoom.
 */
const REGION_BOUNDS: LatLngBoundsExpression = (() => {
  let minLat = 90;
  let maxLat = -90;
  let minLon = 180;
  let maxLon = -180;
  for (const polygon of REGION.geometry.coordinates) {
    for (const ring of polygon) {
      for (const [lon, lat] of ring) {
        minLat = Math.min(minLat, lat);
        maxLat = Math.max(maxLat, lat);
        minLon = Math.min(minLon, lon);
        maxLon = Math.max(maxLon, lon);
      }
    }
  }
  return [
    [minLat, minLon],
    [maxLat, maxLon],
  ];
})();

/** Longitude through the middle of the region, used to push labels outward. */
const REGION_MID_LON =
  ((REGION_BOUNDS as [number, number][])[0][1] + (REGION_BOUNDS as [number, number][])[1][1]) / 2;

/**
 * Builds a gentle arc between two points.
 *
 * A straight line between two settlements would be read as a road, and it is
 * not one — the distances in this product are real road distances, but their
 * geometry is not drawn. An arc is the conventional way to show an
 * origin–destination flow without implying a route.
 */
function arcPoints(
  from: [number, number],
  to: [number, number],
  bend = 0.18,
  steps = 24,
): [number, number][] {
  const [lat1, lon1] = from;
  const [lat2, lon2] = to;
  const midLat = (lat1 + lat2) / 2;
  const midLon = (lon1 + lon2) / 2;

  // Perpendicular offset, scaled by separation so short hops bend less.
  const dLat = lat2 - lat1;
  const dLon = lon2 - lon1;
  const controlLat = midLat + dLon * bend;
  const controlLon = midLon - dLat * bend;

  const points: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const inv = 1 - t;
    points.push([
      inv * inv * lat1 + 2 * inv * t * controlLat + t * t * lat2,
      inv * inv * lon1 + 2 * inv * t * controlLon + t * t * lon2,
    ]);
  }
  return points;
}

/**
 * A chevron at the arc's midpoint, pointing along the direction of travel.
 *
 * Built from the arc's own points so it follows the curve rather than the
 * straight line between endpoints. Sized in degrees of latitude, which is crude
 * but stable at this region's single zoom range.
 */
function chevron(points: [number, number][]): [number, number][][] {
  const mid = Math.floor(points.length / 2);
  const [aLat, aLon] = points[mid - 1] ?? points[0]!;
  const [bLat, bLon] = points[mid + 1] ?? points[points.length - 1]!;

  const dLat = bLat - aLat;
  const dLon = bLon - aLon;
  const len = Math.hypot(dLat, dLon) || 1;
  const ux = dLat / len;
  const uy = dLon / len;

  const tip = points[mid]!;
  const size = 0.085;
  // Two barbs swept back from the tip at roughly 35°.
  const back = 0.82;
  const side = 0.55;
  return [
    [
      [tip[0] - size * (ux * back + uy * side), tip[1] - size * (uy * back - ux * side)],
      tip,
      [tip[0] - size * (ux * back - uy * side), tip[1] - size * (uy * back + ux * side)],
    ],
  ];
}

function settlementRadius(place: MapSettlement["place"], population: number | null): number {
  if (place === "city") return population && population > 150000 ? 9 : 7;
  if (place === "town") return 5.5;
  if (place === "village") return 3.5;
  return 2.5;
}

/** Keeps the viewport on the region, and refits when the container resizes. */
function FitRegion({ bounds }: { bounds: LatLngBoundsExpression }) {
  const map = useMap();
  useEffect(() => {
    map.fitBounds(bounds, { padding: [24, 24] });
    const observer = new ResizeObserver(() => {
      map.invalidateSize();
      map.fitBounds(bounds, { padding: [24, 24], animate: false });
    });
    observer.observe(map.getContainer());
    return () => observer.disconnect();
  }, [map, bounds]);
  return null;
}

export interface RegionMapProps {
  settlements: MapSettlement[];
  arcs?: MapArc[];
  pins?: MapPin[];
  /** Dim everything except the highlighted arcs, for focusing one trip. */
  focusArcIds?: string[];
  /** Show settlement names for cities and towns. */
  labels?: boolean;
  /**
   * Settlements already named by a route label.
   *
   * Without this the map printed a name twice in the same spot — once as the
   * region's own label, once as the trip's stop — which read as a rendering bug.
   */
  namedElsewhere?: string[];
  className?: string;
  onSelectSettlement?: (id: string) => void;
}

export default function RegionMap({
  settlements,
  arcs = [],
  pins = [],
  focusArcIds,
  labels = true,
  namedElsewhere,
  className = "h-full w-full",
  onSelectSettlement,
}: RegionMapProps) {
  const focused = useMemo(
    () => (focusArcIds && focusArcIds.length > 0 ? new Set(focusArcIds) : null),
    [focusArcIds],
  );

  return (
    <div className={className}>
      <MapContainer
        bounds={REGION_BOUNDS}
        zoomControl={false}
        attributionControl={false}
        scrollWheelZoom
        // No tile layer: the outline below is our own data, so the map needs no
        // third-party server at runtime.
        style={{ background: "transparent" }}
      >
        <FitRegion bounds={REGION_BOUNDS} />

        <GeoJSON
          data={REGION}
          style={{
            color: "#CBD4E1",
            weight: 1.25,
            fillColor: "#EEF2F7",
            fillOpacity: 0.75,
            dashArray: "1 0",
          }}
        />

        {arcs.map((arc) => {
          const dimmed = focused !== null && !focused.has(arc.id);
          const width = 1.25 + (arc.weight ?? 0.35) * 4;
          const points = arcPoints(arc.from, arc.to);
          const colour = arc.laden ? "#0E8A6F" : "#C2560D";
          return (
            <Fragment key={arc.id}>
              <Polyline
                positions={points}
                pathOptions={{
                  color: colour,
                  weight: dimmed ? 1 : width,
                  opacity: dimmed ? 0.14 : arc.laden ? 0.9 : 0.75,
                  dashArray: arc.laden ? undefined : "5 6",
                  lineCap: "round",
                }}
              >
                {arc.label ? (
                  <Tooltip sticky>
                    <span className="text-[11px] leading-snug">{arc.label}</span>
                  </Tooltip>
                ) : null}
              </Polyline>

              {arc.arrow && !dimmed
                ? chevron(points).map((barbs, index) => (
                    <Polyline
                      key={`${arc.id}-arrow-${index}`}
                      positions={barbs}
                      interactive={false}
                      pathOptions={{
                        color: colour,
                        weight: Math.max(2, width - 0.5),
                        opacity: 1,
                        lineCap: "round",
                        lineJoin: "round",
                      }}
                    />
                  ))
                : null}
            </Fragment>
          );
        })}

        {settlements.map((settlement) => {
          const big = settlement.place === "city" || settlement.place === "town";
          return (
            <CircleMarker
              key={settlement.id}
              center={[settlement.lat, settlement.lon]}
              radius={settlementRadius(settlement.place, settlement.population)}
              pathOptions={{
                color: big ? "#334154" : "#94A2B8",
                weight: big ? 1.5 : 1,
                fillColor: big ? "#FFFFFF" : "#FFFFFF",
                fillOpacity: 1,
              }}
              eventHandlers={
                onSelectSettlement
                  ? { click: () => onSelectSettlement(settlement.id) }
                  : undefined
              }
            >
              <Tooltip direction="top" offset={[0, -4]}>
                <span className="font-medium">{settlement.name_ru}</span>
                {settlement.population ? (
                  <span className="text-ink-500">
                    {" "}
                    · {settlement.population.toLocaleString("ru-RU")} чел.
                  </span>
                ) : null}
              </Tooltip>
            </CircleMarker>
          );
        })}

        {pins.map((pin) => (
          <CircleMarker
            key={pin.id}
            center={[pin.lat, pin.lon]}
            radius={pin.kind === "vehicle" ? 7 : 6}
            pathOptions={{
              color: pin.kind === "vehicle" ? "#2563EB" : pin.kind === "pickup" ? "#2563EB" : "#0F172A",
              weight: 2.5,
              fillColor: pin.kind === "dropoff" ? "#FFFFFF" : "#2563EB",
              fillOpacity: pin.kind === "dropoff" ? 1 : 0.9,
            }}
          >
            {pin.label ? (
              <Tooltip
                // Leaflet has no collision avoidance, so labels are pushed away
                // from the middle of the region: western stops label to the left,
                // eastern ones to the right. The vehicle's own label goes below
                // instead — a truck usually starts near one of its own stops, and
                // side-by-side the two labels overwrote each other.
                direction={
                  pin.kind === "vehicle" ? "bottom" : pin.lon < REGION_MID_LON ? "left" : "right"
                }
                offset={
                  pin.kind === "vehicle" ? [0, 8] : pin.lon < REGION_MID_LON ? [-8, 0] : [8, 0]
                }
                permanent={pin.permanentLabel ?? pin.kind === "vehicle"}
                className="!border-ink-200 !px-1.5 !py-0.5 !shadow-sm"
              >
                <span className="whitespace-nowrap text-[10.5px] font-semibold text-ink-900">
                  {pin.label}
                </span>
              </Tooltip>
            ) : null}
          </CircleMarker>
        ))}

        {labels ? (
          <SettlementLabels settlements={settlements} skip={namedElsewhere} />
        ) : null}
      </MapContainer>
    </div>
  );
}

/**
 * Names for the largest places only.
 *
 * Leaflet has no label engine, so these are permanent tooltips on invisible
 * markers — cheap, and enough for seven names.
 */
function SettlementLabels({
  settlements,
  skip,
}: {
  settlements: MapSettlement[];
  skip?: string[];
}) {
  const hidden = new Set(skip ?? []);
  const named = settlements
    .filter((s) => (s.place === "city" || s.place === "town") && !hidden.has(s.id))
    .slice(0, 8);

  return (
    <>
      {named.map((settlement) => (
        <CircleMarker
          key={`label-${settlement.id}`}
          center={[settlement.lat, settlement.lon]}
          radius={0}
          pathOptions={{ opacity: 0, fillOpacity: 0 }}
          interactive={false}
        >
          <Tooltip
            permanent
            direction="right"
            offset={[8, 0]}
            className="!border-none !bg-transparent !shadow-none"
          >
            <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-600">
              {settlement.name_ru}
            </span>
          </Tooltip>
        </CircleMarker>
      ))}
    </>
  );
}

/** Guards against server rendering, which Leaflet cannot do. */
export function useMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  const ref = useRef(false);
  useEffect(() => {
    if (!ref.current) {
      ref.current = true;
      setMounted(true);
    }
  }, []);
  return mounted;
}
