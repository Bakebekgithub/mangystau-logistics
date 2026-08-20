import { NextResponse } from "next/server";

import { acceptCounter } from "@/lib/planning";

export const dynamic = "force-dynamic";

/** The shipper agrees to the carrier's figure. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ok = await acceptCounter(id);
  if (!ok) return NextResponse.json({ error: "Встречной цены нет" }, { status: 409 });
  return NextResponse.json({ ok: true });
}
