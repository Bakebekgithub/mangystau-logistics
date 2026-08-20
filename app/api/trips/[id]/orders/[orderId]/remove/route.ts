import { NextResponse } from "next/server";

import { dropOrderFromTrip } from "@/lib/planning";

export const dynamic = "force-dynamic";

/** A carrier declines one consignment but keeps the rest of the trip. */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string; orderId: string }> },
) {
  const { id, orderId } = await params;
  const result = await dropOrderFromTrip(id, orderId);
  if (!result) {
    return NextResponse.json(
      { error: "Груз нельзя убрать — рейс уже в пути или заявка не в нём" },
      { status: 409 },
    );
  }
  return NextResponse.json(result);
}
