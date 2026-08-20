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
    // Substrings, so each one is checked against real cargo wording before it
    // goes in. "лом" alone matched "солома" — hay is feed, not scrap metal —
    // and "соль" matched "фасоль".
    "цемент", "песок", "гравий", "щебен", "щебн", "кирпич", "металлолом",
    "грунт", "глин", "уголь", "отсев", "бетон", "асфальт", "шлак", "мусор", "навал",
  ],
  heavy: [
    // "техник" is deliberately absent: it matched "бытовая техника", which is a
    // boxed fridge for a village shop, and put it on an open flatbed in the rain.
    "арматур", "стройматериал", "оборудован", "труб", "профиль", "балк",
    "плит", "блок", "трактор", "станок", "конструкц", "брус", "доск", "рельс",
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
 * What each body is offered.
 *
 * - Reefer: cold cargo only.
 * - Tent: the workhorse. A closed body takes food, packaged goods and long
 *   freight; nothing poured loose, because it cannot be tipped out.
 * - Flatbed: open platform. Long and loose freight; no food, no boxes in rain.
 * - Tipper: loose freight only. It tips — that is the whole point of it.
 *
 * The reefer restriction is economic, not physical. A refrigerated truck can of
 * course carry wool or spare parts, and in practice it does when there is no
 * chilled load. But it burns 21 l/100 km against 14–18 for a tarpaulin truck, so
 * offering it dry freight means proposing the most expensive vehicle in the fleet
 * for a job a cheaper one should do. The platform exists to allocate the fleet
 * well; sending a fridge after a pallet of spare parts is the opposite.
 *
 * Food, on the other hand, is not reefer-only: a closed tarpaulin body carries
 * vegetables and packaged groceries perfectly well. Whether a consignment
 * actually needs cold is a separate property of the order, checked separately —
 * conflating the two would leave most of the region's food with no truck at all.
 */
const BODY_ACCEPTS: Record<VehicleKind, readonly CargoClass[]> = {
  refrigerator: ["perishable"],
  tent: ["perishable", "general", "heavy"],
  flatbed: ["heavy", "bulk"],
  tipper: ["bulk"],
};

/**
 * Whether this consignment should be offered to this body.
 *
 * `needsCooling` overrides the keyword classification, and has to. A shipper who
 * ticks "нужен рефрижератор" has told us the cargo is perishable whatever they
 * called it, and without this an order flagged for cold but described as
 * "запчасти" fitted nothing at all: the tent refused it on temperature and the
 * reefer on cargo class. Stating the requirement outright beats guessing from a
 * word list.
 */
export function bodyFitsCargo(
  kind: VehicleKind,
  cargo: string,
  needsCooling = false,
): boolean {
  if (needsCooling) return kind === "refrigerator";
  return BODY_ACCEPTS[kind].includes(classifyCargo(cargo));
}

/** Human-readable, for the carrier's screen and the methodology page. */
export const BODY_ACCEPTS_LABEL: Record<VehicleKind, string> = {
  refrigerator: "только скоропортящиеся грузы",
  tent: "продукты, упакованные и длинномерные грузы",
  flatbed: "длинномерные и навалочные грузы",
  tipper: "только навалочные грузы",
};
