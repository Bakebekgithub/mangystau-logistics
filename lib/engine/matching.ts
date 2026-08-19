/**
 * Trip assembly: the part that makes this a dispatcher rather than a noticeboard.
 *
 * A noticeboard matches one order to one truck. This takes a truck and a pool of
 * pending orders and builds a *route* out of several of them — a return load so
 * the truck does not come back empty, and small consignments to remote villages
 * consolidated into one run, none of which would justify a trip of its own.
 *
 * The engine is pure: it takes data in, returns plans out, touches no database.
 * That is what lets tests drive it directly with hand-built fixtures.
 */

import type { DistanceTable, Order, TripPlan, TripStop, Vehicle } from "../types.ts";
import { baselineForOrders, evaluateRoute, savingsAgainstBaseline } from "./economics.ts";

export interface MatchOptions {
  /** Orders whose deadline has passed are not offered. */
  now: Date;
  /** Ceiling on orders combined into one trip. Keeps routes explainable to a driver. */
  maxOrdersPerTrip: number;
  /** An order joins a candidate pool only if adding it detours less than this. */
  maxDetourKm: number;
  /** How many proposals to return, best first. */
  maxProposals: number;
  /** Anchors tried per vehicle. More anchors means a wider search. */
  maxAnchors: number;
}

export const DEFAULT_MATCH_OPTIONS: Omit<MatchOptions, "now"> = {
  maxOrdersPerTrip: 4,
  maxDetourKm: 80,
  maxProposals: 5,
  maxAnchors: 2,
};

/** An order the vehicle is physically and legally able to carry. */
function isServiceable(order: Order, vehicle: Vehicle, now: Date, dist: DistanceTable): boolean {
  if (order.status !== "new") return false;
  if (order.weight_kg > vehicle.capacity_kg) return false;
  if (order.needs_cooling && vehicle.kind !== "refrigerator") return false;
  if (new Date(order.deadline_at) < now) return false;
  // A pair with no known road distance cannot be costed, so it is not offered.
  return (
    dist.has(vehicle.at_id, order.origin_id) &&
    dist.has(order.origin_id, order.destination_id)
  );
}

/**
 * Extra kilometres caused by routing through `via` on the way from `from` to `to`.
 * Zero when `via` already lies on the path.
 */
function detourKm(dist: DistanceTable, from: string, via: string, to: string): number {
  if (!dist.has(from, via) || !dist.has(via, to) || !dist.has(from, to)) return Infinity;
  return dist.km(from, via) + dist.km(via, to) - dist.km(from, to);
}

/**
 * Cheap test for whether an order is worth combining with the anchor: either it
 * fits in the outbound corridor, or it fits in the return corridor — which is
 * exactly what a backhaul is.
 */
function combinationCost(dist: DistanceTable, anchor: Order, other: Order, home: string): number {
  const outbound = Math.min(
    detourKm(dist, anchor.origin_id, other.origin_id, anchor.destination_id) +
      detourKm(dist, anchor.origin_id, other.destination_id, anchor.destination_id),
    Infinity,
  );
  const returnLeg =
    detourKm(dist, anchor.destination_id, other.origin_id, home) +
    detourKm(dist, anchor.destination_id, other.destination_id, home);
  return Math.min(outbound, returnLeg);
}

interface Sequenced {
  stops: TripStop[];
  km: number;
}

/**
 * Finds the shortest valid stop order for a set of orders.
 *
 * Depth-first over the remaining stops with three prunes: a pickup must precede
 * its own dropoff, the load must never exceed capacity, and any partial route
 * already longer than the best complete one is abandoned. For the handful of
 * orders a driver will accept at once this returns the true optimum in
 * milliseconds, so there is no need for a heuristic that might be defended
 * badly on stage.
 */
function optimizeSequence(
  vehicle: Vehicle,
  orders: Order[],
  dist: DistanceTable,
): Sequenced | null {
  type Pending = { order: Order; action: "pickup" | "dropoff" };
  const pending: Pending[] = [];
  for (const order of orders) {
    pending.push({ order, action: "pickup" });
    pending.push({ order, action: "dropoff" });
  }

  let best: Sequenced | null = null;
  const chosen: Pending[] = [];
  const pickedUp = new Set<string>();
  const droppedOff = new Set<string>();

  const walk = (at: string, load: number, km: number) => {
    if (best && km >= best.km) return;

    if (chosen.length === pending.length) {
      // Close the route back to where the vehicle started.
      if (!dist.has(at, vehicle.at_id)) return;
      const total = km + dist.km(at, vehicle.at_id);
      if (best && total >= best.km) return;
      best = {
        km: total,
        stops: chosen.map((c, i) => ({
          seq: i + 1,
          settlement_id: c.action === "pickup" ? c.order.origin_id : c.order.destination_id,
          action: c.action,
          order_id: c.order.id,
        })),
      };
      return;
    }

    for (const candidate of pending) {
      const { order, action } = candidate;
      if (action === "pickup") {
        if (pickedUp.has(order.id)) continue;
        if (load + order.weight_kg > vehicle.capacity_kg) continue;
      } else {
        if (!pickedUp.has(order.id) || droppedOff.has(order.id)) continue;
      }

      const to = action === "pickup" ? order.origin_id : order.destination_id;
      if (!dist.has(at, to)) continue;

      const step = dist.km(at, to);
      if (action === "pickup") pickedUp.add(order.id);
      else droppedOff.add(order.id);
      chosen.push(candidate);

      walk(to, action === "pickup" ? load + order.weight_kg : load - order.weight_kg, km + step);

      chosen.pop();
      if (action === "pickup") pickedUp.delete(order.id);
      else droppedOff.delete(order.id);
    }
  };

  walk(vehicle.at_id, 0, 0);
  return best;
}

/** Which story this plan tells, which decides how the UI presents it. */
function classify(anchor: Order, extras: Order[], dist: DistanceTable): TripPlan["kind"] {
  if (extras.length === 0) return "single";

  const isBackhaul = (o: Order) =>
    dist.has(o.origin_id, anchor.destination_id) &&
    dist.has(o.origin_id, anchor.origin_id) &&
    dist.km(o.origin_id, anchor.destination_id) < dist.km(o.origin_id, anchor.origin_id);

  const backhauls = extras.filter(isBackhaul);
  const sameDirection = extras.filter((o) => !isBackhaul(o));

  if (backhauls.length > 0 && sameDirection.length > 0) return "backhaul+consolidation";
  if (backhauls.length > 0) return "backhaul";
  return "consolidation";
}

function explain(
  kind: TripPlan["kind"],
  plan: Omit<TripPlan, "explanation">,
  orderCount: number,
  nameOf: (id: string) => string,
): string {
  const emptyBefore = plan.baseline_empty_km;
  const emptyAfter = plan.empty_km;
  const paid = Math.round(plan.paid_km_share * 100);

  switch (kind) {
    case "backhaul":
      return (
        `Найден обратный груз, поэтому машина не возвращается порожней. ` +
        `Порожний пробег ${emptyBefore} → ${emptyAfter} км, оплачиваемых километров ${paid}%.`
      );
    case "consolidation":
      return (
        `${orderCount} мелких груза объединены в один рейс. По отдельности ни один ` +
        `не оправдывает выезда: суммарно вышло бы ${plan.baseline_total_km} км вместо ${plan.total_km}.`
      );
    case "backhaul+consolidation":
      return (
        `Попутные грузы собраны по пути и найдена обратная загрузка. ` +
        `Вместо ${plan.baseline_total_km} км отдельными рейсами — ${plan.total_km} км одним, ` +
        `оплачиваемых километров ${paid}%.`
      );
    default:
      return (
        `Один груз до ${nameOf(plan.stops[plan.stops.length - 1]!.settlement_id)}. ` +
        `Обратной загрузки пока нет, порожний пробег ${emptyAfter} км.`
      );
  }
}

/** Every subset of `pool` with size between 1 and `max`. */
function subsets<T>(pool: T[], max: number): T[][] {
  const out: T[][] = [];
  const build = (start: number, current: T[]) => {
    if (current.length > 0) out.push([...current]);
    if (current.length === max) return;
    for (let i = start; i < pool.length; i++) {
      current.push(pool[i]!);
      build(i + 1, current);
      current.pop();
    }
  };
  build(0, []);
  return out;
}

/**
 * Builds trip proposals for one vehicle, best first.
 *
 * Ranked by kilometres avoided rather than by tenge, because kilometres come
 * straight from the road network while tenge depend on a fuel-price assumption.
 */
export function proposeTrips(
  vehicle: Vehicle,
  allOrders: Order[],
  dist: DistanceTable,
  settlementName: (id: string) => string,
  options: MatchOptions,
): TripPlan[] {
  const serviceable = allOrders.filter((o) => isServiceable(o, vehicle, options.now, dist));
  if (serviceable.length === 0) return [];

  /**
   * Anchors: nearest pickup first, and among equally near ones the longest haul.
   *
   * The second key matters more than it looks. Most orders in this region start
   * in the same few hubs, so sorting by distance from the truck alone leaves the
   * order arbitrary — and truncating an arbitrary list drops good anchors. The
   * long haul is the spine of a trip: it defines the corridor other orders can be
   * attached to, so it earns the first anchor slot.
   */
  const anchors = [...serviceable]
    .sort(
      (a, b) =>
        dist.km(vehicle.at_id, a.origin_id) - dist.km(vehicle.at_id, b.origin_id) ||
        dist.km(b.origin_id, b.destination_id) - dist.km(a.origin_id, a.destination_id),
    )
    .slice(0, options.maxAnchors);

  const plans: TripPlan[] = [];
  const orderIndex = new Map(allOrders.map((o) => [o.id, o]));

  for (const anchor of anchors) {
    const pool = serviceable
      .filter((o) => o.id !== anchor.id)
      .map((o) => ({ order: o, cost: combinationCost(dist, anchor, o, vehicle.at_id) }))
      .filter((c) => Number.isFinite(c.cost) && c.cost <= options.maxDetourKm)
      .sort((a, b) => a.cost - b.cost)
      // Cap the pool so subset enumeration stays bounded. Six keeps the exact
      // route search well under a second per vehicle; eight roughly doubled the
      // planning time for a negligible gain in the plans actually chosen.
      .slice(0, 6)
      .map((c) => c.order);

    const combinations: Order[][] = [[anchor]];
    for (const extra of subsets(pool, options.maxOrdersPerTrip - 1)) {
      combinations.push([anchor, ...extra]);
    }

    for (const combo of combinations) {
      // Capacity is enforced inside optimizeSequence, which returns null when no
      // valid pickup/dropoff order keeps the load within the truck.
      const sequenced = optimizeSequence(vehicle, combo, dist);
      if (!sequenced) continue;

      const route = evaluateRoute(vehicle, sequenced.stops, orderIndex, dist);
      const baseline = baselineForOrders(combo, vehicle, dist);
      const savings = savingsAgainstBaseline(route, baseline);

      // A proposal that drives further than doing each order separately is not
      // a proposal worth showing a driver.
      if (savings.km_saved < 0) continue;

      const extras = combo.filter((o) => o.id !== anchor.id);
      const kind = classify(anchor, extras, dist);

      const partial: Omit<TripPlan, "explanation"> = {
        vehicle_id: vehicle.id,
        stops: sequenced.stops,
        order_ids: combo.map((o) => o.id),
        kind,
        total_km: route.total_km,
        laden_km: route.laden_km,
        empty_km: route.empty_km,
        baseline_total_km: baseline.total_km,
        baseline_empty_km: baseline.empty_km,
        fuel_l: route.fuel_l,
        fuel_saved_l: savings.fuel_saved_l,
        money_saved_kzt: savings.money_saved_kzt,
        paid_km_share: route.paid_km_share,
        minutes: route.minutes,
      };

      plans.push({ ...partial, explanation: explain(kind, partial, combo.length, settlementName) });
    }
  }

  // Best first, then drop plans that reuse an order already covered by a better one.
  plans.sort(
    (a, b) =>
      b.baseline_total_km - b.total_km - (a.baseline_total_km - a.total_km) ||
      b.order_ids.length - a.order_ids.length,
  );

  const seen = new Set<string>();
  const distinct: TripPlan[] = [];
  for (const plan of plans) {
    const key = [...plan.order_ids].sort().join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    distinct.push(plan);
    if (distinct.length >= options.maxProposals) break;
  }

  return distinct;
}
