import { NextResponse } from "next/server";

import { listTrips, type TripView } from "@/lib/queries";
import { indicativePriceKzt } from "@/lib/engine/economics";

export const dynamic = "force-dynamic";

const STATUSES: TripView["status"][] = [
  "proposed",
  "accepted",
  "in_transit",
  "completed",
  "declined",
];

/** Trips with their indicative price attached, so no caller recomputes it. */
export async function GET(request: Request) {
  const status = new URL(request.url).searchParams.get("status");
  if (status && !STATUSES.includes(status as TripView["status"])) {
    return NextResponse.json({ error: "Неизвестный статус" }, { status: 400 });
  }

  const trips = await listTrips((status as TripView["status"] | null) ?? undefined);
  return NextResponse.json(
    trips.map((trip) => ({ ...trip, price_kzt: indicativePriceKzt(trip.fuel_l) })),
  );
}
