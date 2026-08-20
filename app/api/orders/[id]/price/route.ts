import { NextResponse } from "next/server";

import { setShipperPrice } from "@/lib/planning";

export const dynamic = "force-dynamic";

/** The shipper names their price, or answers a counter with a new figure. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const price = Number(body.price);

  if (!Number.isFinite(price) || price <= 0) {
    return NextResponse.json({ error: "Укажите цену в тенге" }, { status: 400 });
  }
  if (price > 100_000_000) {
    return NextResponse.json({ error: "Слишком большая сумма" }, { status: 400 });
  }

  const ok = await setShipperPrice(id, price);
  if (!ok) return NextResponse.json({ error: "Заявка не найдена" }, { status: 404 });
  return NextResponse.json({ ok: true, offered_price_kzt: Math.round(price) });
}
