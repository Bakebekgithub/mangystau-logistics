import { NextResponse } from "next/server";

import { acceptTrip } from "@/lib/planning";

export const dynamic = "force-dynamic";

/**
 * A driver takes a proposed trip. Competing proposals that claimed any of the
 * same orders are withdrawn, so two drivers are never sent for one pallet.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const accepted = await acceptTrip(id);
  if (!accepted) {
    return NextResponse.json(
      { error: "Рейс уже не доступен — возможно, его взял кто-то другой" },
      { status: 409 },
    );
  }
  return NextResponse.json({ ok: true });
}
