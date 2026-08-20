/**
 * Which cargo goes in which body.
 *
 * Weight and refrigeration were not enough. A tipper was being offered bottled
 * water and a reefer was being offered bricks — both physically absurd, and the
 * kind of thing anyone who has actually loaded a truck spots in one second.
 *
 * The rule lives here alone, so the engine (which must not build a trip nobody
 * can take) and the carrier's screen (which must not show one) cannot disagree.
 *
 * Deliberately coarse. A real dispatcher knows more than four classes, but four
 * classes are enough to stop the absurd cases, and every extra class is another
 * assumption we would have to defend without knowing the region's fleet.
 */

import type { VehicleKind } from "../types.ts";

/**
 * What a consignment demands of a body.
 *
 * - `perishable` — needs cold, or at least a closed box in summer heat
 * - `bulk`       — poured or thrown in loose: sand, gravel, cement, scrap
 * - `heavy`      — long or heavy, loaded by crane, indifferent to weather
 * - `general`    — packaged goods that must stay dry
 */
export type CargoClass = "perishable" | "bulk" | "heavy" | "general";

/**
 * Keywords per class, matched against the cargo text.
 *
 * Substring matching on a lowercased string, so "стройматериалы" also catches
 * "стройматериалов". Russian is inflected and the shipper types freely.
 */
const CLASS_KEYWORDS: Record<Exclude<CargoClass, "general">, readonly string[]> = {
  perishable: [
    "продукт", "мясо", "рыб", "молоч", "молоко", "овощ", "фрукт", "медикамент",
    "лекарств", "помидор", "картоф", "яйц", "мороже", "скоропорт", "куриц", "птиц",
  ],
  bulk: [
    "цемент", "песок", "гравий", "щебен", "щебн", "кирпич", "металлолом", "лом",
    "грунт", "глин", "уголь", "соль", "отсев", "бетон", "асфальт", "шлак", "мусор",
  ],
  heavy: [
    "арматур", "стройматериал", "оборудован", "труб", "металл", "профиль", "балк",
    "плит", "блок", "техник", "трактор", "станок", "конструкц", "лес", "брус", "доск",
  ],
};

/**
 * Classifies a consignment from its description.
 *
 * Order matters: perishable first, because "оборудование для мяса" is a machine,
 * but "мясо" in cold storage is not something to put on an open flatbed. Bulk
 * before heavy, because "кирпич" is loose freight even though it is building
 * material.
 */
export function classifyCargo(cargo: string): CargoClass {
  const text = cargo.toLowerCase();
  for (const cls of ["perishable", "bulk", "heavy"] as const) {
    if (CLASS_KEYWORDS[cls].some((keyword) => text.includes(keyword))) return cls;
  }
  // Anything unrecognised is treated as packaged goods needing a covered body,
  // which is the safe default: a tarpaulin truck can carry almost anything.
  return "general";
}

/**
 * What each body is willing to carry.
 *
 * - Reefer: cold cargo, and packaged goods when there is no cold load — but
 *   never sand or rebar, which would wreck the insulation.
 * - Tent: the workhorse. A closed body takes food, packaged goods and long
 *   freight; nothing poured loose, because it cannot be tipped out.
 * - Flatbed: open platform. Long and loose freight; no food, no boxes in rain.
 * - Tipper: loose freight only. It tips — that is the whole point of it.
 *
 * Food is not reefer-only: a closed tarpaulin body carries vegetables and
 * packaged groceries perfectly well. Whether a given consignment actually needs
 * cold is a separate property of the order, checked separately — conflating the
 * two here would leave most of the region's food with no truck at all.
 */
const BODY_ACCEPTS: Record<VehicleKind, readonly CargoClass[]> = {
  refrigerator: ["perishable", "general"],
  tent: ["perishable", "general", "heavy"],
  flatbed: ["heavy", "bulk"],
  tipper: ["bulk"],
};

/** Whether this body can carry this consignment at all. */
export function bodyFitsCargo(kind: VehicleKind, cargo: string): boolean {
  return BODY_ACCEPTS[kind].includes(classifyCargo(cargo));
}

/** Human-readable, for the carrier's screen and the methodology page. */
export const BODY_ACCEPTS_LABEL: Record<VehicleKind, string> = {
  refrigerator: "скоропорт и упакованные грузы",
  tent: "продукты, упакованные и длинномерные грузы",
  flatbed: "длинномерные и навалочные грузы",
  tipper: "только навалочные грузы",
};
