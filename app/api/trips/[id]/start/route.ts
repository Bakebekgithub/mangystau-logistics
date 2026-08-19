import { NextResponse } from "next/server";

import { startTrip } from "@/lib/planning";

export const dynamic = "force-dynamic";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const started = await startTrip(id);
  if (!started) {
    return NextResponse.json({ error: "Рейс нельзя начать в текущем статусе" }, { status: 409 });
  }
  return NextResponse.json({ ok: true });
}
