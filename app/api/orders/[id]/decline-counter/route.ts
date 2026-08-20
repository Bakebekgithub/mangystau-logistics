import { NextResponse } from "next/server";

import { declineCounter } from "@/lib/planning";

export const dynamic = "force-dynamic";

/** The shipper declines the carrier's figure and stands by their own. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ok = await declineCounter(id);
  if (!ok) return NextResponse.json({ error: "Встречной цены нет" }, { status: 409 });
  return NextResponse.json({ ok: true });
}
