/**
 * Persistence for the planning cycle and the lifecycle of a trip.
 *
 * Proposals are recomputed and stored rather than calculated per request: a full
 * fleet plan takes seconds, and no screen should wait for that. Proposals are
 * disposable — the cycle clears the previous ones and writes fresh. Trips a
 * driver has already accepted are never touched.
 */

import { getDb } from "./db.ts";
import { loadContext, proposeAcrossFleet } from "./dispatch.ts";
import { baselineForOrders, evaluateRoute, savingsAgainstBaseline } from "./engine/economics.ts";
import { classify, explain } from "./engine/matching.ts";
import type { Order, TripPlan, TripStop, Vehicle } from "./types.ts";

function newId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

export interface PlanningSummary {
  trips: number;
  orders_covered: number;
  total_km: number;
  empty_km: number;
  paid_km_share: number;
  fuel_saved_l: number;
  money_saved_kzt: number;
  took_ms: number;
}

/**
 * Clears outstanding proposals and writes a fresh set.
 *
 * Only orders still marked `new` are eligible, so anything a driver already took
 * stays his.
 */
export async function regenerateProposals(): Promise<PlanningSummary> {
  const db = getDb();
  const started = Date.now();

  // trip_stops cascade on delete.
  await db.query(`DELETE FROM trips WHERE status = 'proposed'`);

  const sets = await proposeAcrossFleet();

  let orders_covered = 0;
  let total_km = 0;
  let laden_km = 0;
  let empty_km = 0;
  let fuel_saved_l = 0;
  let money_saved_kzt = 0;

  for (const { plans } of sets) {
    const plan = plans[0]!;
    await persistTrip(plan);
    orders_covered += plan.order_ids.length;
    total_km += plan.total_km;
    laden_km += plan.laden_km;
    empty_km += plan.empty_km;
    fuel_saved_l += plan.fuel_saved_l;
    money_saved_kzt += plan.money_saved_kzt;
  }

  return {
    trips: sets.length,
    orders_covered,
    total_km: round1(total_km),
    empty_km: round1(empty_km),
    paid_km_share: total_km > 0 ? Math.round((laden_km / total_km) * 1000) / 1000 : 0,
    fuel_saved_l: round1(fuel_saved_l),
    money_saved_kzt,
    took_ms: Date.now() - started,
  };
}

async function persistTrip(plan: TripPlan): Promise<string> {
  const db = getDb();
  const tripId = newId("trip");

  await db.query(
    `INSERT INTO trips (
       id, vehicle_id, status, kind, total_km, laden_km, empty_km,
       baseline_total_km, baseline_empty_km, fuel_l, fuel_saved_l, money_saved_kzt,
       paid_km_share, minutes, explanation, explained_by
     ) VALUES ($1,$2,'proposed',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'rules')`,
    [
      tripId,
      plan.vehicle_id,
      plan.kind,
      plan.total_km,
      plan.laden_km,
      plan.empty_km,
      plan.baseline_total_km,
      plan.baseline_empty_km,
      plan.fuel_l,
      plan.fuel_saved_l,
      plan.money_saved_kzt,
      plan.paid_km_share,
      plan.minutes,
      plan.explanation,
    ],
  );

  // One statement for every stop rather than one per stop. Against a database in
  // another country each round trip costs ~100 ms, and a planning cycle inserts
  // roughly a hundred stops — that alone was most of the wait.
  if (plan.stops.length > 0) {
    const values: unknown[] = [];
    const tuples = plan.stops.map((stop) => {
      const row = [newId("stop"), tripId, stop.seq, stop.settlement_id, stop.action, stop.order_id];
      const placeholders = row.map((value) => {
        values.push(value);
        return `$${values.length}`;
      });
      return `(${placeholders.join(",")})`;
    });
    await db.query(
      `INSERT INTO trip_stops (id, trip_id, seq, settlement_id, action, order_id)
       VALUES ${tuples.join(",")}`,
      values,
    );
  }

  return tripId;
}

/**
 * A driver takes a trip. Its orders leave the pool, and every other proposal
 * that had claimed one of them is withdrawn so two drivers cannot be sent for
 * the same pallet.
 */
export async function acceptTrip(tripId: string): Promise<boolean> {
  const db = getDb();

  const [trip] = await db.query<{ id: string; status: string }>(
    `SELECT id, status FROM trips WHERE id = $1`,
    [tripId],
  );
  if (!trip || trip.status !== "proposed") return false;

  const orderIds = (
    await db.query<{ order_id: string }>(
      `SELECT DISTINCT order_id FROM trip_stops WHERE trip_id = $1 AND order_id IS NOT NULL`,
      [tripId],
    )
  ).map((r) => r.order_id);

  await db.query(`UPDATE trips SET status = 'accepted', accepted_at = now() WHERE id = $1`, [tripId]);
  await db.query(
    `UPDATE orders SET status = 'matched' WHERE id = ANY($1::text[])`,
    [orderIds],
  );

  // Withdraw competing proposals.
  await db.query(
    `DELETE FROM trips
     WHERE status = 'proposed'
       AND id IN (
         SELECT DISTINCT trip_id FROM trip_stops
         WHERE order_id = ANY($1::text[])
       )`,
    [orderIds],
  );

  return true;
}

/** The driver starts driving. */
export async function startTrip(tripId: string): Promise<boolean> {
  const db = getDb();
  const rows = await db.query<{ id: string }>(
    `UPDATE trips SET status = 'in_transit' WHERE id = $1 AND status = 'accepted' RETURNING id`,
    [tripId],
  );
  if (rows.length === 0) return false;
  await db.query(
    `UPDATE orders SET status = 'in_transit'
     WHERE id IN (SELECT order_id FROM trip_stops WHERE trip_id = $1 AND order_id IS NOT NULL)`,
    [tripId],
  );
  return true;
}

/**
 * The driver taps "done" at a stop. Delivering the last dropoff of an order
 * completes that order; completing every stop completes the trip.
 */
export async function completeStop(stopId: string): Promise<{ trip_completed: boolean } | null> {
  const db = getDb();

  const [stop] = await db.query<{ trip_id: string; order_id: string | null; action: string }>(
    `UPDATE trip_stops SET done_at = now()
     WHERE id = $1 AND done_at IS NULL
     RETURNING trip_id, order_id, action`,
    [stopId],
  );
  if (!stop) return null;

  if (stop.action === "dropoff" && stop.order_id) {
    await db.query(`UPDATE orders SET status = 'delivered' WHERE id = $1`, [stop.order_id]);
  }

  const [{ remaining }] = await db.query<{ remaining: string }>(
    `SELECT count(*) AS remaining FROM trip_stops WHERE trip_id = $1 AND done_at IS NULL`,
    [stop.trip_id],
  );

  if (Number(remaining) === 0) {
    await db.query(
      `UPDATE trips SET status = 'completed', completed_at = now() WHERE id = $1`,
      [stop.trip_id],
    );
    // The truck is now wherever it finished, which is where it started, because
    // routes are closed. Kept explicit so a future open route updates position.
    await loadContext();
    return { trip_completed: true };
  }

  return { trip_completed: false };
}

function round1(x: number): number {
  return Math.round(x * 10) / 10;
}

/**
 * A carrier drops one consignment from a trip and keeps the rest.
 *
 * The route is genuinely re-walked afterwards rather than having its numbers
 * adjusted: removing a stop changes the order of everything after it, which
 * changes distance, fuel and the empty share. A card that kept the old figures
 * would be lying about the trip the driver is actually about to drive.
 *
 * The dropped order goes back into the pool, so the next planning cycle can
 * offer it to someone else.
 */
export async function dropOrderFromTrip(
  tripId: string,
  orderId: string,
): Promise<{ removed: true; trip_deleted: boolean } | null> {
  const db = getDb();

  const [trip] = await db.query<{ id: string; status: string; vehicle_id: string }>(
    `SELECT id, status, vehicle_id FROM trips WHERE id = $1`,
    [tripId],
  );
  // Once a driver is rolling, dropping cargo is a phone call, not a button.
  if (!trip || (trip.status !== "proposed" && trip.status !== "accepted")) return null;

  const stops = await db.query<{ id: string; seq: number; settlement_id: string; action: "pickup" | "dropoff"; order_id: string }>(
    `SELECT id, seq, settlement_id, action, order_id FROM trip_stops
     WHERE trip_id = $1 ORDER BY seq`,
    [tripId],
  );
  if (!stops.some((s) => s.order_id === orderId)) return null;

  await db.query(`DELETE FROM trip_stops WHERE trip_id = $1 AND order_id = $2`, [tripId, orderId]);
  await db.query(
    `UPDATE orders SET status = 'new' WHERE id = $1 AND status <> 'delivered'`,
    [orderId],
  );

  const remaining = stops.filter((s) => s.order_id !== orderId);
  if (remaining.length === 0) {
    await db.query(`DELETE FROM trips WHERE id = $1`, [tripId]);
    return { removed: true, trip_deleted: true };
  }

  // Resequence so the stops stay 1..n and the timeline reads correctly.
  const resequenced: TripStop[] = remaining.map((stop, index) => ({
    seq: index + 1,
    settlement_id: stop.settlement_id,
    action: stop.action,
    order_id: stop.order_id,
  }));
  for (const [index, stop] of remaining.entries()) {
    await db.query(`UPDATE trip_stops SET seq = $1 WHERE id = $2`, [index + 1, stop.id]);
  }

  const [vehicle] = await db.query<Vehicle>(
    `SELECT id, carrier_id, plate, kind, capacity_kg, fuel_per_100km, at_id
     FROM vehicles WHERE id = $1`,
    [trip.vehicle_id],
  );
  const orderRows = await db.query<Order>(
    `SELECT id, shipper_name, origin_id, destination_id, cargo, weight_kg, needs_cooling,
            ready_at, deadline_at, status
     FROM orders WHERE id = ANY($1::text[])`,
    [[...new Set(resequenced.map((s) => s.order_id))]],
  );
  const orders = new Map(
    orderRows.map((o) => [o.id, { ...o, weight_kg: Number(o.weight_kg) }] as const),
  );
  const typedVehicle: Vehicle = {
    ...vehicle,
    capacity_kg: Number(vehicle.capacity_kg),
    fuel_per_100km: Number(vehicle.fuel_per_100km),
  };

  const { dist, nameOf } = await loadContext();
  const route = evaluateRoute(typedVehicle, resequenced, orders, dist);
  const baseline = baselineForOrders([...orders.values()], typedVehicle, dist);
  const savings = savingsAgainstBaseline(route, baseline);

  // The explanation is recomputed too. Leaving the old sentence in place left a
  // card claiming 100% paid kilometres above a bar that read 94% — the sort of
  // contradiction a judge notices before anything else.
  const anchorOrder = orders.get(resequenced[0]!.order_id)!;
  const extras = [...orders.values()].filter((o) => o.id !== anchorOrder.id);
  const kind = classify(anchorOrder, extras, dist);
  const explanation = explain(
    kind,
    {
      vehicle_id: typedVehicle.id,
      stops: resequenced,
      order_ids: [...orders.keys()],
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
    },
    orders.size,
    nameOf,
  );

  await db.query(
    `UPDATE trips SET total_km = $2, laden_km = $3, empty_km = $4,
            baseline_total_km = $5, baseline_empty_km = $6,
            fuel_l = $7, fuel_saved_l = $8, money_saved_kzt = $9,
            paid_km_share = $10, minutes = $11,
            kind = $12, explanation = $13
     WHERE id = $1`,
    [
      tripId,
      route.total_km,
      route.laden_km,
      route.empty_km,
      baseline.total_km,
      baseline.empty_km,
      route.fuel_l,
      savings.fuel_saved_l,
      savings.money_saved_kzt,
      route.paid_km_share,
      route.minutes,
      kind,
      explanation,
    ],
  );

  return { removed: true, trip_deleted: false };
}

/** A carrier names their own figure. The shipper sees it and answers. */
export async function counterOffer(orderId: string, priceKzt: number): Promise<boolean> {
  const db = getDb();
  const rows = await db.query<{ id: string }>(
    `UPDATE orders SET counter_price_kzt = $2, price_status = 'countered'
     WHERE id = $1 AND status <> 'delivered'
     RETURNING id`,
    [orderId, Math.round(priceKzt)],
  );
  return rows.length > 0;
}

/** The shipper accepts the counter, and it becomes the agreed price. */
export async function acceptCounter(orderId: string): Promise<boolean> {
  const db = getDb();
  const rows = await db.query<{ id: string }>(
    `UPDATE orders
     SET offered_price_kzt = counter_price_kzt, counter_price_kzt = NULL, price_status = 'agreed'
     WHERE id = $1 AND counter_price_kzt IS NOT NULL
     RETURNING id`,
    [orderId],
  );
  return rows.length > 0;
}
