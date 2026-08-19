const RU = "ru-RU";

export function km(value: number): string {
  return `${value.toLocaleString(RU, { maximumFractionDigits: value < 100 ? 1 : 0 })} км`;
}

export function kzt(value: number): string {
  return `${Math.round(value).toLocaleString(RU)} ₸`;
}

export function litres(value: number): string {
  return `${value.toLocaleString(RU, { maximumFractionDigits: 0 })} л`;
}

export function weight(kilograms: number): string {
  if (kilograms >= 1000) {
    return `${(kilograms / 1000).toLocaleString(RU, { maximumFractionDigits: 1 })} т`;
  }
  return `${kilograms.toLocaleString(RU)} кг`;
}

export function percent(fraction: number): string {
  return `${Math.round(fraction * 100)}%`;
}

export function duration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = Math.round(minutes % 60);
  if (hours === 0) return `${rest} мин`;
  if (rest === 0) return `${hours} ч`;
  return `${hours} ч ${rest} мин`;
}

const PLACE_LABEL: Record<string, string> = {
  city: "город",
  town: "пгт",
  village: "село",
  hamlet: "населённый пункт",
};

export function placeLabel(place: string): string {
  return PLACE_LABEL[place] ?? place;
}

const VEHICLE_LABEL: Record<string, string> = {
  tent: "тент",
  refrigerator: "рефрижератор",
  flatbed: "бортовой",
  tipper: "самосвал",
};

export function vehicleLabel(kind: string): string {
  return VEHICLE_LABEL[kind] ?? kind;
}

/**
 * A readable one-line route.
 *
 * Trips are closed loops — the vehicle returns to where it started — so naively
 * printing "first stop → last stop" produces "Бейнеу → Бейнеу", which reads as a
 * bug rather than as a round trip. This collapses consecutive repeats and marks
 * the loop explicitly.
 */
export function routeSummary(
  stopNames: string[],
  options: { maxParts?: number } = {},
): string {
  const max = options.maxParts ?? 4;

  const unique: string[] = [];
  for (const name of stopNames) {
    if (unique[unique.length - 1] !== name) unique.push(name);
  }
  if (unique.length === 0) return "—";
  // Everything happening in one place is not a route.
  if (unique.length === 1) return unique[0]!;

  const first = unique[0]!;
  const last = unique[unique.length - 1]!;
  const isLoop = first === last;
  const middle = unique.slice(1, -1);

  // `max` bounds the printed parts. The ellipsis marker occupies one of them,
  // so a truncated route shows max - 3 intermediate names, never fewer than one.
  const parts =
    middle.length + 2 <= max
      ? [first, ...middle, last]
      : (() => {
          const shown = middle.slice(0, Math.max(1, max - 3));
          return [first, ...shown, `+${middle.length - shown.length}`, last];
        })();

  return parts.join(" → ") + (isLoop ? " ⟲" : "");
}

/** Human-readable date/time in the region's usual style. */
export function when(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleString(RU, {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
}
