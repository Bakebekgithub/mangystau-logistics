import { NextResponse } from "next/server";

import { getDb } from "@/lib/db";
import { invalidateContext } from "@/lib/dispatch";
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

  const { carriers, vehicles, orders } = generateSeed(settlements, {
    ...DEFAULT_SEED_CONFIG,
    now: new Date(),
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
      `INSERT INTO orders (id, shipper_name, origin_id, destination_id, cargo, weight_kg,
                           needs_cooling, ready_at, deadline_at, status, parsed_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'new','seed')`,
      [order.id, order.shipper_name, order.origin_id, order.destination_id, order.cargo,
       order.weight_kg, order.needs_cooling, order.ready_at, order.deadline_at],
    );
  }

  invalidateContext();

  // Deliberately does not plan. The demo runner calls /api/plan as its own step,
  // and planning twice doubled the wait before anything appeared on screen.
  return NextResponse.json({
    reset: { carriers: carriers.length, vehicles: vehicles.length, orders: orders.length },
  });
}
