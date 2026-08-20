import { NextResponse } from "next/server";

import { loadContext } from "@/lib/dispatch";
import { recommendedOrderPriceKzt } from "@/lib/engine/economics";
import type { VehicleKind } from "@/lib/types";

const KINDS = ["tent", "refrigerator", "flatbed", "tipper"];

export const dynamic = "force-dynamic";

/**
 * The recommended floor for one consignment.
 *
 * Called by the order composer as the shipper edits the draft, so the number
 * beside the price field always matches the route and weight on screen.
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const origin = params.get("origin");
  const destination = params.get("destination");
  const weight = Number(params.get("weight"));
  const kindParam = params.get("kind");
  const kind = KINDS.includes(kindParam ?? "") ? (kindParam as VehicleKind) : null;

  if (!origin || !destination || !Number.isFinite(weight) || weight <= 0) {
    return NextResponse.json({ error: "Нужны origin, destination и weight" }, { status: 400 });
  }

  const { dist } = await loadContext();
  if (!dist.has(origin, destination)) {
    return NextResponse.json({ error: "Маршрут неизвестен" }, { status: 404 });
  }

  const km = dist.km(origin, destination);
  return NextResponse.json({ km, ...recommendedOrderPriceKzt(km, weight, kind) });
}
