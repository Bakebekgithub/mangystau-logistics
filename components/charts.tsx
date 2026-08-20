"use client";

import { useState } from "react";

/**
 * Charts as inline SVG, no library.
 *
 * Shared conventions, applied to every mark here: one hue per measure (never a
 * palette cycled across bars of the same quantity), thin marks with rounded
 * data-ends anchored to the baseline, recessive axes, values labelled directly
 * rather than through a legend, and a hover layer on every plot.
 */

export interface RankedItem {
  id: string;
  label: string;
  value: number;
  /** Optional second line under the label. */
  note?: string;
}

/**
 * Ranked horizontal bars — the right form for "which corridors carry the most".
 *
 * Horizontal because the labels are place names, which read badly rotated, and
 * ranked because the comparison people actually make here is "bigger than what".
 */
export function RankedBars({
  items,
  unit,
  hue = "accent",
  maxValue,
}: {
  items: RankedItem[];
  unit?: string;
  hue?: "accent" | "laden" | "empty";
  maxValue?: number;
}) {
  const [hovered, setHovered] = useState<string | null>(null);
  const color = { accent: "#2563EB", laden: "#0E8A6F", empty: "#C2560D" }[hue];
  const max = maxValue ?? Math.max(1, ...items.map((item) => item.value));

  if (items.length === 0) {
    return <p className="text-small text-ink-500">Нет данных за период.</p>;
  }

  return (
    <ul className="space-y-2.5">
      {items.map((item) => {
        const share = (item.value / max) * 100;
        const active = hovered === item.id;
        return (
          <li
            key={item.id}
            onMouseEnter={() => setHovered(item.id)}
            onMouseLeave={() => setHovered(null)}
            className="group"
          >
            <div className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 truncate text-small text-ink-700">{item.label}</span>
              <span
                className={`tnum shrink-0 text-small transition-colors ${
                  active ? "text-ink-900" : "text-ink-500"
                }`}
              >
                {item.value.toLocaleString("ru-RU")}
                {unit ? <span className="text-ink-600"> {unit}</span> : null}
              </span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-pill bg-ink-100">
              <div
                className="h-full rounded-pill transition-all duration-500 ease-swift"
                style={{
                  width: `${Math.max(2, share)}%`,
                  backgroundColor: color,
                  opacity: hovered === null || active ? 1 : 0.45,
                }}
              />
            </div>
            {item.note ? (
              <div className="mt-0.5 text-[0.6875rem] text-ink-600">{item.note}</div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Two totals on one axis: what the region would drive today, and what the plan
 * drives instead.
 *
 * One axis, never two — the whole comparison depends on the bars being directly
 * measurable against each other. Each bar is split into its laden and empty
 * parts, with a 2px surface gap between the segments so the boundary is visible
 * without a border.
 */
export function BeforeAfterBars({
  before,
  after,
  unit = "км",
}: {
  before: { label: string; laden: number; empty: number };
  after: { label: string; laden: number; empty: number };
  unit?: string;
}) {
  const beforeTotal = before.laden + before.empty;
  const afterTotal = after.laden + after.empty;
  const max = Math.max(1, beforeTotal, afterTotal);

  const rows = [before, after];

  return (
    <div className="space-y-4">
      {rows.map((row, index) => {
        const total = row.laden + row.empty;
        return (
          <div key={row.label}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-small text-ink-700">{row.label}</span>
              <span className="tnum text-small text-ink-900">
                {Math.round(total).toLocaleString("ru-RU")}{" "}
                <span className="text-ink-600">{unit}</span>
              </span>
            </div>
            <div
              className="mt-1.5 flex h-3 gap-[2px]"
              style={{ width: `${(total / max) * 100}%`, minWidth: "8%" }}
            >
              <div
                className="h-full rounded-l-pill transition-all duration-700 ease-swift"
                style={{ width: `${(row.laden / total) * 100}%`, backgroundColor: "#0E8A6F" }}
                title={`С грузом: ${Math.round(row.laden).toLocaleString("ru-RU")} ${unit}`}
              />
              <div
                className="h-full rounded-r-pill transition-all duration-700 ease-swift"
                style={{ width: `${(row.empty / total) * 100}%`, backgroundColor: "#C2560D" }}
                title={`Порожний: ${Math.round(row.empty).toLocaleString("ru-RU")} ${unit}`}
              />
            </div>
            {index === rows.length - 1 && beforeTotal > afterTotal ? (
              <div className="mt-1.5 text-[0.6875rem] text-laden-ink">
                на {Math.round(beforeTotal - afterTotal).toLocaleString("ru-RU")} {unit} меньше —
                это {Math.round((1 - afterTotal / beforeTotal) * 100)}%
              </div>
            ) : null}
          </div>
        );
      })}

      <div className="flex items-center gap-4 border-t border-ink-200 pt-3 text-[0.6875rem]">
        <span className="flex items-center gap-1.5 text-laden-ink">
          <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: "#0E8A6F" }} />
          с грузом
        </span>
        <span className="flex items-center gap-1.5 text-empty-ink">
          <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: "#C2560D" }} />
          порожний
        </span>
      </div>
    </div>
  );
}

/**
 * A donut is the wrong form for a proportion of a whole this important, so the
 * "orders served" figure gets a segmented track instead: countable units, which
 * is what an order is.
 */
export function UnitTrack({
  served,
  total,
  label,
}: {
  served: number;
  total: number;
  label: string;
}) {
  const cells = Array.from({ length: total }, (_, index) => index < served);
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-caption uppercase text-ink-500">{label}</span>
        <span className="tnum text-small text-ink-600">
          <span className="text-ink-900">{served}</span> из {total}
        </span>
      </div>
      <div className="mt-2 flex flex-wrap gap-[3px]">
        {cells.map((filled, index) => (
          <span
            key={index}
            className="h-3 w-[6px] rounded-sm transition-colors"
            style={{ backgroundColor: filled ? "#0E8A6F" : "#1D2430" }}
          />
        ))}
      </div>
    </div>
  );
}
