/**
 * Filling a trip a carrier has already agreed offline.
 *
 * This is the case the region actually lives in. A driver has a deal of his own —
 * «еду в Бейнеу, везу оборудование» — and three tonnes of the body are empty. On
 * the way back the truck is empty entirely. Nothing on a noticeboard helps him:
 * he is not looking for a trip, he is looking for cargo that fits *this* trip.
 *
 * So the question is different from planning a route from scratch. The corridor
 * is fixed and not ours to change; what we choose is which consignments cost the
 * fewest extra kilometres to collect along it.
 *
 * Two lists come back, because they are worth different money to him:
 *
 *   - `along`  — cargo picked up and dropped off between here and there, using
 *                capacity that would otherwise travel as air.
 *   - `back`   — cargo for the return leg, which he is currently planning to
 *                drive empty. This is the one that changes his economics.
 */

import { bodyFitsCargo } from "./cargo-fit.ts";
import { ASSUMPTIONS, consumptionPerKm, recommendedOrderPriceKzt } from "./economics.ts";
import type { DistanceTable, Order, VehicleKind } from "../types.ts";

export interface TopUpRequest {
  /** Where the truck is now. */
  origin_id: string;
  /** Where it is already going. */
  destination_id: string;
  /** Capacity still free on the outbound leg, in kilograms. */
  free_kg: number;
  kind: VehicleKind;
  /** Full capacity, used for the return leg — coming home it is all free. */
  capacity_kg: number;
  /** Litres per 100 km empty, for costing the detour. */
  fuel_per_100km: number;
  now: Date;
}

export interface TopUpCandidate {
  order: Order;
  /** Extra kilometres this consignment adds to the corridor. */
  detour_km: number;
  /** Litres those extra kilometres burn, at this load. */
  detour_fuel_l: number;
  /** What the shipper offers, or the recommended floor if they named nothing. */
  pays_kzt: number;
  /** Offer minus the diesel the detour costs. The driver's actual gain. */
  net_kzt: number;
  /** Which leg this rides on. */
  leg: "along" | "back";
}

export interface TopUpResult {
  corridor_km: number;
  along: TopUpCandidate[];
  back: TopUpCandidate[];
}

/** Detour limit. Beyond this a driver with his own schedule simply says no. */
const MAX_DETOUR_KM = 120;

/**
 * The detour may not eat more than half the fee.
 *
 * A positive balance is not the same as a worthwhile job. Fifty-five kilometres
 * out of the way for 145 ₸ left over is arithmetically a gain and practically an
 * insult; listing it teaches the driver to ignore the list. Half is a round,
 * defensible line: below it the diesel, not the freight, is running the trip.
 */
const MIN_NET_SHARE_OF_FEE = 0.5;

/**
 * Extra distance to collect and deliver `order` while travelling from → to.
 *
 * Returns Infinity when any leg is unknown, so an uncostable candidate can never
 * be offered — a silent zero here would present a detour as free.
 */
function detourFor(
  dist: DistanceTable,
  from: string,
  to: string,
  order: Order,
): number {
  if (
    !dist.has(from, order.origin_id) ||
    !dist.has(order.origin_id, order.destination_id) ||
    !dist.has(order.destination_id, to) ||
    !dist.has(from, to)
  ) {
    return Infinity;
  }
  const viaCargo =
    dist.km(from, order.origin_id) +
    dist.km(order.origin_id, order.destination_id) +
    dist.km(order.destination_id, to);
  return Math.round((viaCargo - dist.km(from, to)) * 10) / 10;
}

function pays(order: Order, dist: DistanceTable): number {
  if (order.offered_price_kzt) return order.offered_price_kzt;
  const km = dist.has(order.origin_id, order.destination_id)
    ? dist.km(order.origin_id, order.destination_id)
    : 0;
  return recommendedOrderPriceKzt(km, order.weight_kg).price_kzt;
}

/**
 * Ranks the pool for one leg of the corridor.
 *
 * Sorted by what the driver clears after diesel, not by what he is paid: a
 * larger offer two hundred kilometres off the road is worth less than a smaller
 * one on it, and ranking by the headline figure would hide that.
 */
function rank(
  pool: Order[],
  dist: DistanceTable,
  request: TopUpRequest,
  from: string,
  to: string,
  capacityKg: number,
  leg: "along" | "back",
): TopUpCandidate[] {
  const candidates: TopUpCandidate[] = [];

  for (const order of pool) {
    if (order.status !== "new") continue;
    if (order.weight_kg > capacityKg) continue;
    if (order.needs_cooling && request.kind !== "refrigerator") continue;
    if (!bodyFitsCargo(request.kind, order.cargo)) continue;
    if (new Date(order.deadline_at) < request.now) continue;

    const detour_km = detourFor(dist, from, to, order);
    if (!Number.isFinite(detour_km) || detour_km > MAX_DETOUR_KM) continue;

    // The detour is driven loaded, so it burns the laden rate.
    const perKm = consumptionPerKm(
      {
        id: "topup",
        carrier_id: "topup",
        plate: "",
        kind: request.kind,
        capacity_kg: request.capacity_kg,
        fuel_per_100km: request.fuel_per_100km,
        at_id: from,
      },
      order.weight_kg / request.capacity_kg,
    );
    const detour_fuel_l = Math.round(detour_km * perKm * 10) / 10;
    const pays_kzt = pays(order, dist);

    candidates.push({
      order,
      detour_km,
      detour_fuel_l,
      pays_kzt,
      net_kzt: Math.round(pays_kzt - detour_fuel_l * ASSUMPTIONS.dieselPriceKztPerL),
      leg,
    });
  }

  // Only offers that leave the driver meaningfully better off. He is already
  // making this trip; a consignment that eats most of its fee in diesel is not
  // an opportunity, and showing it devalues the ones that are.
  return candidates
    .filter((candidate) => candidate.net_kzt >= candidate.pays_kzt * MIN_NET_SHARE_OF_FEE)
    .sort((a, b) => b.net_kzt - a.net_kzt)
    .slice(0, 6);
}

/**
 * What this truck could add to a trip it is already making.
 *
 * The outbound leg is limited to the capacity the driver says is free. The
 * return leg is not: he is planning to drive it empty, so the whole body is
 * available.
 */
export function findTopUp(
  pool: Order[],
  dist: DistanceTable,
  request: TopUpRequest,
): TopUpResult {
  const { origin_id, destination_id } = request;
  return {
    corridor_km: dist.has(origin_id, destination_id) ? dist.km(origin_id, destination_id) : 0,
    along: rank(pool, dist, request, origin_id, destination_id, request.free_kg, "along"),
    back: rank(pool, dist, request, destination_id, origin_id, request.capacity_kg, "back"),
  };
}
