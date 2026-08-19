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
import type { TripPlan } from "./types.ts";

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

  for (const stop of plan.stops) {
    await db.query(
      `INSERT INTO trip_stops (id, trip_id, seq, settlement_id, action, order_id)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [newId("stop"), tripId, stop.seq, stop.settlement_id, stop.action, stop.order_id],
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
