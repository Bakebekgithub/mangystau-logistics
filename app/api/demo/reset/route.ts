import { NextResponse } from "next/server";

import { getDb } from "@/lib/db";
import { invalidateContext, loadContext } from "@/lib/dispatch";
import { regenerateProposals } from "@/lib/planning";
import { DEFAULT_SEED_CONFIG, generateSeed } from "@/lib/seed";
import type { Settlement } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Puts the demo back to its starting state.
 *
 * Reference data (settlements, road distances) is left alone — it is real and
 * never changes. Only the modelled demand and any trips built from it are
 * rebuilt, from the same seed, so a rehearsed demo behaves identically on stage.
 */
export async function POST() {
  const db = getDb();

  await db.query(`DELETE FROM trips`);
  await db.query(`DELETE FROM orders`);
  await db.query(`DELETE FROM vehicles`);
  await db.query(`DELETE FROM carriers`);

  const settlements = await db.query<Settlement>(
    `SELECT id, name_kz, name_ru, place, population, lat, lon FROM settlements`,
  );
  if (settlements.length === 0) {
    return NextResponse.json(
      { error: "Справочные данные не загружены — выполните npm run db:seed" },
      { status: 500 },
    );
  }

  // Distances are real reference data and survived the wipe, so the modelled
  // shippers can be given prices on the same basis as a real one.
  const context = await loadContext();
  const { carriers, vehicles, orders } = generateSeed(settlements, {
    ...DEFAULT_SEED_CONFIG,
    now: new Date(),
    kmOf: (from, to) => (context.dist.has(from, to) ? context.dist.km(from, to) : null),
  });

  for (const carrier of carriers) {
    await db.query(
      `INSERT INTO carriers (id, name, phone, base_id) VALUES ($1,$2,$3,$4)`,
      [carrier.id, carrier.name, carrier.phone, carrier.base_id],
    );
  }
  for (const vehicle of vehicles) {
    await db.query(
      `INSERT INTO vehicles (id, carrier_id, plate, kind, capacity_kg, fuel_per_100km, at_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [vehicle.id, vehicle.carrier_id, vehicle.plate, vehicle.kind, vehicle.capacity_kg, vehicle.fuel_per_100km, vehicle.at_id],
    );
  }
  for (const order of orders) {
    await db.query(
      `INSERT INTO orders (id, shipper_name, shipper_phone, origin_id, destination_id, cargo,
                           weight_kg, needs_cooling, ready_at, deadline_at,
                           offered_price_kzt, price_status, status, parsed_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'offered','new','seed')`,
      [order.id, order.shipper_name, order.shipper_phone ?? null, order.origin_id,
       order.destination_id, order.cargo, order.weight_kg, order.needs_cooling,
       order.ready_at, order.deadline_at, order.offered_price_kzt ?? null],
    );
  }

  invalidateContext();

  // Plans immediately. Skipping this made the reset faster, but anyone who left
  // the demo page mid-run came back to an app with no trips at all — a worse
  // failure than a few seconds of waiting.
  const planning = await regenerateProposals();

  return NextResponse.json({
    reset: { carriers: carriers.length, vehicles: vehicles.length, orders: orders.length },
    planning,
  });
}
