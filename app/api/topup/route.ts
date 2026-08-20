import { NextResponse } from "next/server";

import { loadContext, loadOrders } from "@/lib/dispatch";
import { findTopUp } from "@/lib/engine/topup";
import type { Order, VehicleKind } from "@/lib/types";

export const dynamic = "force-dynamic";

const BODIES: VehicleKind[] = ["tent", "refrigerator", "flatbed", "tipper"];

/**
 * Cargo for a trip the carrier has already agreed elsewhere.
 *
 * Read-only: nothing is reserved. The driver is choosing, and until he taps
 * "beru" the consignment stays available to everyone else.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));

  const origin_id = String(body.origin_id ?? "");
  const destination_id = String(body.destination_id ?? "");
  const free_kg = Number(body.free_kg);
  const capacity_kg = Number(body.capacity_kg);
  const kind = BODIES.includes(body.kind) ? (body.kind as VehicleKind) : "tent";

  if (!origin_id || !destination_id || origin_id === destination_id) {
    return NextResponse.json({ error: "Укажите разные пункты отправления и назначения" }, { status: 400 });
  }
  if (!Number.isFinite(free_kg) || free_kg <= 0) {
    return NextResponse.json({ error: "Укажите свободный вес" }, { status: 400 });
  }
  if (!Number.isFinite(capacity_kg) || capacity_kg < free_kg) {
    return NextResponse.json({ error: "Свободный вес больше вместимости" }, { status: 400 });
  }

  const [context, pool] = await Promise.all([loadContext(), loadOrders("new")]);
  if (!context.dist.has(origin_id, destination_id)) {
    return NextResponse.json({ error: "Между этими пунктами нет известного маршрута" }, { status: 404 });
  }

  const result = findTopUp(
    pool.map((order: Order) => ({
      ...order,
      weight_kg: Number(order.weight_kg),
      offered_price_kzt:
        order.offered_price_kzt === null || order.offered_price_kzt === undefined
          ? null
          : Number(order.offered_price_kzt),
    })),
    context.dist,
    {
      origin_id,
      destination_id,
      free_kg,
      capacity_kg,
      kind,
      // Litres per 100 km empty for a body of this size, matching the fleet mix.
      fuel_per_100km: capacity_kg >= 12000 ? 26 : capacity_kg >= 8000 ? 22 : 17,
      now: new Date(),
    },
  );

  const decorate = (candidates: typeof result.along) =>
    candidates.map((candidate) => ({
      ...candidate,
      order: {
        id: candidate.order.id,
        cargo: candidate.order.cargo,
        weight_kg: candidate.order.weight_kg,
        shipper_name: candidate.order.shipper_name,
        origin_name: context.nameOf(candidate.order.origin_id),
        destination_name: context.nameOf(candidate.order.destination_id),
      },
    }));

  return NextResponse.json({
    corridor_km: result.corridor_km,
    along: decorate(result.along),
    back: decorate(result.back),
  });
}
