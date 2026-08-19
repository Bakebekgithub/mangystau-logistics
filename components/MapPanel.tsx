"use client";

import dynamic from "next/dynamic";

import type { RegionMapProps } from "./RegionMap";

/**
 * Loads the map only in the browser.
 *
 * Leaflet measures a real DOM node, so it cannot be server-rendered. The
 * placeholder holds the same space to avoid a layout jump when the map arrives.
 */
const RegionMap = dynamic(() => import("./RegionMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center rounded-card border border-ink-200 bg-white">
      <div className="flex items-center gap-2.5 text-small text-ink-500">
        <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-brand" />
        Карта области загружается
      </div>
    </div>
  ),
});

export function MapPanel(props: RegionMapProps) {
  return <RegionMap {...props} />;
}
