import { NextResponse } from "next/server";

import { completeStop } from "@/lib/planning";

export const dynamic = "force-dynamic";

/** The driver taps "delivered" at a stop. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await completeStop(id);
  if (!result) {
    return NextResponse.json({ error: "Остановка уже отмечена или не найдена" }, { status: 409 });
  }
  return NextResponse.json(result);
}
