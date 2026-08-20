/**
 * Glue between the database and the pure engine.
 *
 * Everything the engine needs is loaded here and handed over as plain data, so
 * the engine stays testable and this file stays boring.
 */

import { getDb } from "./db.ts";
import { buildDistanceTable, type DistanceRow } from "./distance.ts";
import { ASSUMPTIONS, recommendedOrderPriceKzt } from "./engine/economics.ts";
import { DEFAULT_MATCH_OPTIONS, proposeTrips, type MatchOptions } from "./engine/matching.ts";
import type { DistanceTable, Order, Settlement, TripPlan, Vehicle } from "./types.ts";

export interface DispatchContext {
  settlements: Settlement[];
  byId: Map<string, Settlement>;
  dist: DistanceTable;
  nameOf: (id: string) => string;
}

/**
 * Loads reference data. The settlement list and distance matrix never change at
 * runtime, so this is cached for the lifetime of the process.
 */
let contextCache: Promise<DispatchContext> | null = null;

export function loadContext(): Promise<DispatchContext> {
  if (!contextCache) contextCache = build();
  return contextCache;
}

async function build(): Promise<DispatchContext> {
  const db = getDb();
  const settlements = await db.query<Settlement>(
    `SELECT id, osm_id, name_kz, name_ru, place, population, lat, lon
     FROM settlements ORDER BY population DESC NULLS LAST`,
  );
  const rows = await db.query<DistanceRow>(`SELECT from_id, to_id, km, minutes FROM distances`);

  const byId = new Map(settlements.map((s) => [s.id, s]));
  return {
    settlements,
    byId,
    dist: buildDistanceTable(rows),
    nameOf: (id) => byId.get(id)?.name_ru ?? id,
  };
}

export function invalidateContext(): void {
  contextCache = null;
}

export async function loadOrders(status?: Order["status"]): Promise<Order[]> {
  const db = getDb();
  const where = status ? `WHERE status = $1` : ``;
  return db.query<Order>(
    `SELECT id, shipper_name, origin_id, destination_id, cargo, weight_kg,
            needs_cooling, ready_at, deadline_at, offered_price_kzt, status, raw_text, parsed_by
     FROM orders ${where} ORDER BY created_at`,
    status ? [status] : [],
  );
}

export async function loadVehicles(): Promise<Vehicle[]> {
  const db = getDb();
  return db.query<Vehicle>(
    `SELECT id, carrier_id, plate, kind, capacity_kg, fuel_per_100km, at_id FROM vehicles ORDER BY id`,
  );
}

/** Numbers arrive from Postgres as strings for numeric columns; normalise once. */
function normaliseVehicle(v: Vehicle): Vehicle {
  return { ...v, capacity_kg: Number(v.capacity_kg), fuel_per_100km: Number(v.fuel_per_100km) };
}

function normaliseOrder(o: Order): Order {
  return {
    ...o,
    weight_kg: Number(o.weight_kg),
    offered_price_kzt: o.offered_price_kzt === null || o.offered_price_kzt === undefined
      ? null
      : Number(o.offered_price_kzt),
  };
}

export interface ProposalSet {
  vehicle: Vehicle;
  plans: TripPlan[];
}

/** Proposals for one vehicle against the current pool of pending orders. */
export async function proposeForVehicle(
  vehicleId: string,
  options?: Partial<MatchOptions>,
): Promise<ProposalSet | null> {
  const [context, vehicles, orders] = await Promise.all([
    loadContext(),
    loadVehicles(),
    loadOrders("new"),
  ]);

  const vehicle = vehicles.map(normaliseVehicle).find((v) => v.id === vehicleId);
  if (!vehicle) return null;

  const plans = proposeTrips(
    vehicle,
    orders.map(normaliseOrder),
    context.dist,
    context.nameOf,
    { ...DEFAULT_MATCH_OPTIONS, now: new Date(), ...options },
  );
  return { vehicle, plans };
}

/**
 * One best proposal per vehicle across the whole fleet, without offering the
 * same order to two drivers.
 *
 * Assignment is greedy and iterative: every unassigned vehicle is re-planned
 * against the orders still unclaimed, the single best plan is taken, and the
 * round repeats. Re-planning each round matters — a truck whose first choice was
 * taken usually has a good second route over what is left, and simply filtering
 * its stale plan list would leave it idle and most orders unserved.
 *
 * Greedy rather than globally optimal is a deliberate choice: a driver needs an
 * answer the second he opens the app, and the result is explainable — the truck
 * that saves most gets first pick.
 */
export async function proposeAcrossFleet(
  options?: Partial<MatchOptions>,
): Promise<ProposalSet[]> {
  const [context, vehiclesRaw, ordersRaw] = await Promise.all([
    loadContext(),
    loadVehicles(),
    loadOrders("new"),
  ]);

  const unassigned = new Map(vehiclesRaw.map(normaliseVehicle).map((v) => [v.id, v]));
  let pool = ordersRaw.map(normaliseOrder);
  const result: ProposalSet[] = [];

  /**
   * Orders a person actually placed, as opposed to the modelled demand.
   *
   * These are served first. Ranking purely by kilometres saved let a real
   * customer order lose to a bigger synthetic one and go unassigned entirely —
   * which is both wrong as a product (the person who just ordered is the one
   * waiting) and useless as a demonstration.
   */
  const typed = new Set(pool.filter((order) => order.raw_text).map((order) => order.id));
  const TYPED_PRIORITY_KM = 100_000;

  const matchOptions: MatchOptions = {
    ...DEFAULT_MATCH_OPTIONS,
    now: new Date(),
    priorityOrderIds: typed,
    ...options,
  };

  // Plans are cached per vehicle and only recomputed when a vehicle's cached
  // choice used an order that has since been claimed. Without this the loop
  // re-plans the entire fleet every round, which measured at 14 seconds — far
  // too slow to sit behind a web request.
  const cache = new Map<string, TripPlan[]>();

  /**
   * Kilometres avoided, with customer orders lifted above the modelled pool.
   *
   * The bonus counts orders rather than merely detecting one. A flat bonus made
   * every plan holding a single customer order look equally good, so three
   * consignments a person had just placed were served by three separate trucks —
   * the exact opposite of what this product is for.
   */
  const score = (plan: TripPlan) =>
    savingOf(plan) + plan.order_ids.filter((id) => typed.has(id)).length * TYPED_PRIORITY_KM;

  /**
   * What a plan pays, in tenge.
   *
   * An order whose shipper has not named a figure yet is valued at the platform's
   * recommended floor. Treating it as zero would mean a freshly placed order
   * never got a truck — the opposite of what the shipper is waiting for.
   */
  const priceOf = new Map(
    ordersRaw.map(normaliseOrder).map((order) => {
      if (order.offered_price_kzt) return [order.id, order.offered_price_kzt] as const;
      const km = context.dist.has(order.origin_id, order.destination_id)
        ? context.dist.km(order.origin_id, order.destination_id)
        : 0;
      return [order.id, recommendedOrderPriceKzt(km, order.weight_kg).price_kzt] as const;
    }),
  );

  /**
   * Never offer a trip that does not pay for its own diesel.
   *
   * The engine will happily assemble a route for four small consignments spread
   * across the region: it saves kilometres against the baseline, which is what it
   * optimises. But the driver would be paid 39 000 ₸ to burn 106 000 ₸ of fuel,
   * and offering that destroys any trust in every other number on the screen.
   * Kilometres saved is the region's metric; covering fuel is the driver's, and
   * a proposal has to satisfy both to be worth showing.
   */
  const coversFuel = (plan: TripPlan) => {
    const revenue = plan.order_ids.reduce((sum, id) => sum + (priceOf.get(id) ?? 0), 0);
    return revenue >= plan.fuel_l * ASSUMPTIONS.dieselPriceKztPerL;
  };

  while (unassigned.size > 0 && pool.length > 0) {
    let best: { vehicle: Vehicle; plans: TripPlan[] } | null = null;

    for (const vehicle of unassigned.values()) {
      let plans = cache.get(vehicle.id);
      if (!plans) {
        plans = proposeTrips(vehicle, pool, context.dist, context.nameOf, matchOptions).filter(
          coversFuel,
        );
        cache.set(vehicle.id, plans);
      }
      if (plans.length === 0) continue;

      // Re-rank this vehicle's own plans so a plan carrying a customer order
      // wins over a merely longer one.
      const ranked = [...plans].sort((a, b) => score(b) - score(a));
      if (!best || score(ranked[0]!) > score(best.plans[0]!)) {
        best = { vehicle, plans: ranked };
      }
    }

    if (!best) break;

    const taken = new Set(best.plans[0]!.order_ids);
    pool = pool.filter((o) => !taken.has(o.id));
    unassigned.delete(best.vehicle.id);
    cache.delete(best.vehicle.id);
    result.push(best);

    // Invalidate only the vehicles whose cached plans are now stale.
    for (const [vehicleId, plans] of cache) {
      if (plans.some((plan) => plan.order_ids.some((id) => taken.has(id)))) {
        cache.delete(vehicleId);
      }
    }
  }

  return result;
}

function savingOf(plan: TripPlan): number {
  return plan.baseline_total_km - plan.total_km;
}
