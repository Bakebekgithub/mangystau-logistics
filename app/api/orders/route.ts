import { NextResponse } from "next/server";

import { createOrder, OrderValidationError, type DraftOrder } from "@/lib/orders";
import { listOrders } from "@/lib/queries";
import type { OrderStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

const STATUSES: OrderStatus[] = ["new", "matched", "in_transit", "delivered", "expired"];

export async function GET(request: Request) {
  const status = new URL(request.url).searchParams.get("status");
  if (status && !STATUSES.includes(status as OrderStatus)) {
    return NextResponse.json({ error: "Неизвестный статус" }, { status: 400 });
  }
  return NextResponse.json(await listOrders((status as OrderStatus | null) ?? undefined));
}

/** Creates a confirmed order. Validation lives in lib/orders.ts. */
export async function POST(request: Request) {
  let draft: Partial<DraftOrder>;
  try {
    draft = await request.json();
  } catch {
    return NextResponse.json({ error: "Ожидается JSON" }, { status: 400 });
  }

  const required = ["origin_id", "destination_id", "cargo", "weight_kg", "ready_at", "deadline_at"] as const;
  const missing = required.filter((field) => draft[field] === undefined || draft[field] === null);
  if (missing.length > 0) {
    return NextResponse.json(
      { error: `Не заполнено: ${missing.join(", ")}` },
      { status: 400 },
    );
  }

  try {
    const order = await createOrder({
      shipper_name: String(draft.shipper_name ?? "Отправитель"),
      shipper_phone: draft.shipper_phone ? String(draft.shipper_phone).slice(0, 32) : null,
      offered_price_kzt: draft.offered_price_kzt ? Number(draft.offered_price_kzt) : null,
      required_kind: draft.required_kind ? String(draft.required_kind) : null,
      origin_id: String(draft.origin_id),
      destination_id: String(draft.destination_id),
      cargo: String(draft.cargo),
      weight_kg: Number(draft.weight_kg),
      needs_cooling: Boolean(draft.needs_cooling),
      ready_at: String(draft.ready_at),
      deadline_at: String(draft.deadline_at),
      raw_text: draft.raw_text ? String(draft.raw_text) : null,
      parsed_by: draft.parsed_by ?? null,
    });
    return NextResponse.json(order, { status: 201 });
  } catch (error) {
    if (error instanceof OrderValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
