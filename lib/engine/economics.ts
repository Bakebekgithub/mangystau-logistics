/**
 * Fuel, kilometres and money.
 *
 * Every number the product shows comes out of this file, and every assumption
 * behind it is a named constant exported for the methodology screen. Nothing is
 * hard-coded at a call site, so what the pitch claims and what the code
 * computes cannot drift apart.
 *
 * A subtlety worth stating plainly, because it decides whether the economics
 * survive scrutiny: pairing a return load does NOT save that driver fuel. He
 * drives the same kilometres either way — they simply become paid instead of
 * empty. The fuel genuinely saved is regional: the second shipper no longer
 * needs a separate dedicated run. So savings are always measured against the
 * baseline of "each order served by its own out-and-back trip", which is how
 * the region works today.
 */

import type { DistanceTable, Order, TripStop, Vehicle } from "../types.ts";

export const ASSUMPTIONS = {
  /**
   * Retail diesel, Kazakhstan, August 2026. Reported range was 330–343 ₸/l;
   * the midpoint is used. Carriers buying wholesale (~250 ₸/l) would see
   * proportionally smaller tenge figures for the same litres.
   */
  dieselPriceKztPerL: 335,
  dieselPriceNote:
    "Розничная цена ДТ в Казахстане, август 2026: 330–343 ₸/л, взята середина. " +
    "Оптовая закупка (~250 ₸/л) даёт пропорционально меньшие суммы в тенге.",

  /**
   * A fully loaded truck burns roughly 30% more than the same truck empty.
   * Consumption is interpolated linearly with the load fraction, which is the
   * standard rule of thumb for road freight and is deliberately conservative:
   * it makes assembled trips look slightly more expensive, not less.
   */
  ladenSurchargeAtFullLoad: 0.3,
  ladenSurchargeNote:
    "Полная загрузка добавляет ~30% к расходу; между порожним и полным " +
    "расход интерполируется линейно по доле загрузки.",

  /**
   * Detour factor measured from this region's own road network: 4158 routable
   * pairs, road distance against great-circle. Reported, not used in maths,
   * because all distances are real road distances.
   */
  measuredDetourFactor: 1.533,
  detourNote:
    "Дороги Мангистау в среднем на 53% длиннее прямой линии (1.533), " +
    "измерено по 4158 маршрутам OSRM.",

  /** Average speed used only where a road duration is unavailable. */
  fallbackSpeedKmh: 60,

  /**
   * Empty-running share in the region today. This is the hackathon brief's own
   * figure, used deliberately instead of one of ours: regional savings are
   * measured against the organisers' number, so the baseline is not ours to be
   * accused of choosing favourably.
   */
  regionalEmptyShareToday: 0.4,
  regionalEmptyShareNote:
    "Порожний пробег в регионе сегодня ~40% — цифра из кейса хакатона. " +
    "Экономия считается относительно неё, а не относительно нашего допущения.",

  /**
   * Fuel cost as a share of a carrier's operating cost, used to turn a fuel
   * figure into an indicative trip price.
   *
   * This is a stated assumption, not a measured tariff. We deliberately do not
   * invent a per-tonne-kilometre rate for the region — we do not know it, and a
   * made-up rate is the first thing that would fall apart under questioning.
   * Instead the price is derived from the one cost we do compute from real data
   * (fuel over real road distances) and scaled by this share, which covers the
   * driver, wear, and margin. Shippers and carriers still agree the final figure
   * between themselves; the product shows a starting point, not a price list.
   */
  fuelShareOfOperatingCost: 0.38,
  priceNote:
    "Ориентировочная цена = стоимость топлива ÷ 0.38. Топливо считается по реальным " +
    "дорожным расстояниям, доля топлива в затратах перевозчика — заявленное допущение. " +
    "Это ориентир для начала разговора, а не тариф: стороны договариваются сами.",

  minChargedShareNote:
    "Рекомендованный минимум = топливо на груженое плечо ÷ 0.38, умноженное на долю " +
    "кузова под грузом (не меньше 30%: маленькая партия не стоит десятую часть фуры). " +
    "Это пол, а не тариф — цену в заявке пишет сам заказчик.",

  distanceSource: "OSRM на дорожной сети OpenStreetMap, 2080 пар, все по дорогам",
  settlementSource: "OpenStreetMap, 65 населённых пунктов Мангистауской области, ODbL",
} as const;

/**
 * Reference truck classes for pricing, mirroring the fleet in lib/seed.ts.
 *
 * Pricing needs a truck before a truck is assigned, so the recommendation uses
 * the smallest class that can carry the consignment. A larger truck actually
 * showing up does not change what the shipper was quoted.
 */
const PRICING_CLASSES: readonly { capacity_kg: number; fuel_per_100km: number }[] = [
  { capacity_kg: 3000, fuel_per_100km: 14 },
  { capacity_kg: 5000, fuel_per_100km: 18 },
  { capacity_kg: 10000, fuel_per_100km: 22 },
  { capacity_kg: 15000, fuel_per_100km: 28 },
];

/**
 * The smallest share of a truck a consignment is charged for.
 *
 * A 300 kg pallet does not cost a tenth of a lorry: someone still drives the
 * route, and the truck cannot be filled with thirty separate pallets. Charging
 * a floor share is what keeps a recommendation for small cargo believable —
 * and small cargo to the villages is the case the brief is about.
 */
const MIN_CHARGED_SHARE = 0.3;

export interface PriceRecommendation {
  /** The floor, in tenge, rounded to 500. */
  price_kzt: number;
  /** Litres the loaded leg burns — what the number is built from. */
  fuel_l: number;
  /** Truck class the recommendation assumes. */
  capacity_kg: number;
  /** Share of the truck this consignment is charged for. */
  charged_share: number;
}

/**
 * What a shipper should expect to pay, at minimum, for one consignment.
 *
 * Deliberately a floor and not a price: the platform does not know Mangystau's
 * freight rates and does not invent them. What it can compute from real data is
 * the cost of driving the loaded leg — fuel over real road distance — scaled by
 * the share of a carrier's costs that fuel represents. Below this figure the
 * carrier drives at a loss. Above it, the two sides negotiate, exactly as they
 * do on the phone today; the shipper types the number.
 */
export function recommendedOrderPriceKzt(km: number, weightKg: number): PriceRecommendation {
  const cls =
    PRICING_CLASSES.find((c) => c.capacity_kg >= weightKg) ??
    PRICING_CLASSES[PRICING_CLASSES.length - 1]!;

  // Cost of dedicating the truck to this leg, fully loaded.
  const per100Laden = cls.fuel_per_100km * (1 + ASSUMPTIONS.ladenSurchargeAtFullLoad);
  const fullLegLitres = (km * per100Laden) / 100;
  const fullLegCost = (fullLegLitres * ASSUMPTIONS.dieselPriceKztPerL) / ASSUMPTIONS.fuelShareOfOperatingCost;

  const share = Math.min(1, Math.max(MIN_CHARGED_SHARE, weightKg / cls.capacity_kg));

  return {
    price_kzt: Math.max(2000, Math.round((fullLegCost * share) / 500) * 500),
    fuel_l: round1(fullLegLitres * share),
    capacity_kg: cls.capacity_kg,
    charged_share: round3(share),
  };
}

/**
 * An indicative price for a trip, derived from its fuel cost.
 *
 * Returns tenge, rounded to the nearest 500 so it reads as an estimate rather
 * than a quote — a figure like 74 000 ₸ invites negotiation, 73 847 ₸ pretends
 * to a precision we do not have.
 */
export function indicativePriceKzt(fuelLitres: number): number {
  const fuelCost = fuelLitres * ASSUMPTIONS.dieselPriceKztPerL;
  const price = fuelCost / ASSUMPTIONS.fuelShareOfOperatingCost;
  return Math.round(price / 500) * 500;
}

/** Litres per kilometre for a given load fraction (0 = empty, 1 = full). */
export function consumptionPerKm(vehicle: Vehicle, loadFraction: number): number {
  const clamped = Math.min(Math.max(loadFraction, 0), 1);
  const per100 = vehicle.fuel_per_100km * (1 + ASSUMPTIONS.ladenSurchargeAtFullLoad * clamped);
  return per100 / 100;
}

export interface RouteSegment {
  from: string;
  to: string;
  km: number;
  minutes: number;
  /** Cargo aboard while traversing this segment. */
  load_kg: number;
  fuel_l: number;
}

export interface RouteEvaluation {
  segments: RouteSegment[];
  total_km: number;
  laden_km: number;
  empty_km: number;
  minutes: number;
  fuel_l: number;
  /** Share of kilometres carrying cargo. The carrier's own headline metric. */
  paid_km_share: number;
}

/**
 * Walks a stop sequence and works out distance, time, load and fuel.
 *
 * The vehicle starts where it currently is, so the repositioning leg to the
 * first pickup is charged to the trip. The route is then closed back to the
 * starting point, because the baseline it is compared against also returns —
 * otherwise savings would be flattered by simply abandoning the truck.
 */
export function evaluateRoute(
  vehicle: Vehicle,
  stops: TripStop[],
  orders: Map<string, Order>,
  dist: DistanceTable,
): RouteEvaluation {
  const segments: RouteSegment[] = [];
  let at = vehicle.at_id;
  let load = 0;

  const traverse = (to: string, loadDuring: number) => {
    if (to === at) return;
    const km = dist.km(at, to);
    const minutes = dist.minutes(at, to);
    segments.push({
      from: at,
      to,
      km,
      minutes,
      load_kg: loadDuring,
      fuel_l: km * consumptionPerKm(vehicle, loadDuring / vehicle.capacity_kg),
    });
    at = to;
  };

  for (const stop of stops) {
    traverse(stop.settlement_id, load);
    const order = orders.get(stop.order_id);
    if (!order) throw new Error(`stop references unknown order ${stop.order_id}`);
    load += stop.action === "pickup" ? order.weight_kg : -order.weight_kg;
    if (load < 0) throw new Error(`negative load after stop ${stop.seq}; stop order is invalid`);
  }

  if (load !== 0) throw new Error("route ends with cargo still aboard");
  traverse(vehicle.at_id, 0);

  const total_km = round1(sum(segments.map((s) => s.km)));
  const laden_km = round1(sum(segments.filter((s) => s.load_kg > 0).map((s) => s.km)));
  const empty_km = round1(total_km - laden_km);

  return {
    segments,
    total_km,
    laden_km,
    empty_km,
    minutes: Math.round(sum(segments.map((s) => s.minutes))),
    fuel_l: round1(sum(segments.map((s) => s.fuel_l))),
    paid_km_share: total_km > 0 ? round3(laden_km / total_km) : 0,
  };
}

export interface Baseline {
  total_km: number;
  empty_km: number;
  fuel_l: number;
  minutes: number;
}

/**
 * The world without the dispatcher: every order gets its own truck, driven
 * loaded to the destination and empty back to where it started.
 */
export function baselineForOrders(
  orders: Order[],
  vehicle: Vehicle,
  dist: DistanceTable,
): Baseline {
  let total_km = 0;
  let empty_km = 0;
  let fuel_l = 0;
  let minutes = 0;

  for (const order of orders) {
    const km = dist.km(order.origin_id, order.destination_id);
    const back = dist.km(order.destination_id, order.origin_id);
    const loadFraction = order.weight_kg / vehicle.capacity_kg;

    total_km += km + back;
    empty_km += back;
    fuel_l += km * consumptionPerKm(vehicle, loadFraction) + back * consumptionPerKm(vehicle, 0);
    minutes += dist.minutes(order.origin_id, order.destination_id) + dist.minutes(order.destination_id, order.origin_id);
  }

  return {
    total_km: round1(total_km),
    empty_km: round1(empty_km),
    fuel_l: round1(fuel_l),
    minutes: Math.round(minutes),
  };
}

export interface Savings {
  km_saved: number;
  empty_km_saved: number;
  fuel_saved_l: number;
  money_saved_kzt: number;
  /** Fraction of the baseline avoided, for a headline percentage. */
  share_of_baseline: number;
}

export function savingsAgainstBaseline(route: RouteEvaluation, baseline: Baseline): Savings {
  const fuel_saved_l = round1(baseline.fuel_l - route.fuel_l);
  return {
    km_saved: round1(baseline.total_km - route.total_km),
    empty_km_saved: round1(baseline.empty_km - route.empty_km),
    fuel_saved_l,
    money_saved_kzt: Math.round(fuel_saved_l * ASSUMPTIONS.dieselPriceKztPerL),
    share_of_baseline:
      baseline.total_km > 0 ? round3((baseline.total_km - route.total_km) / baseline.total_km) : 0,
  };
}

function sum(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0);
}

function round1(x: number): number {
  return Math.round(x * 10) / 10;
}

function round3(x: number): number {
  return Math.round(x * 1000) / 1000;
}
