/**
 * Creating orders, including from a free-text message.
 *
 * The parse and the insert are deliberately separate: the shipper sees what was
 * understood and confirms it before anything is written. A dispatcher who
 * mistypes a destination should find out on screen, not when a truck arrives.
 */

import { getDb } from "./db.ts";
import { loadContext } from "./dispatch.ts";
import { parseOrder, type ParsedOrder } from "./ai/parse-order.ts";
import type { Order } from "./types.ts";

export interface DraftOrder {
  shipper_name: string;
  origin_id: string;
  destination_id: string;
  cargo: string;
  weight_kg: number;
  needs_cooling: boolean;
  ready_at: string;
  deadline_at: string;
  raw_text?: string | null;
  parsed_by?: "ai" | "rules" | "seed" | null;
}

/** Runs the parser against the current settlement list. Writes nothing. */
export async function parseOrderText(text: string): Promise<ParsedOrder> {
  const context = await loadContext();
  return parseOrder(text, { settlements: context.settlements, now: new Date() });
}

export class OrderValidationError extends Error {}

/**
 * Validates and inserts an order.
 *
 * Validation happens here rather than in the route handler so the same rules
 * apply however the order arrives — typed message, form, or future import.
 */
export async function createOrder(draft: DraftOrder): Promise<Order> {
  const db = getDb();
  const context = await loadContext();

  if (!context.byId.has(draft.origin_id)) {
    throw new OrderValidationError(`Неизвестный пункт отправления: ${draft.origin_id}`);
  }
  if (!context.byId.has(draft.destination_id)) {
    throw new OrderValidationError(`Неизвестный пункт назначения: ${draft.destination_id}`);
  }
  if (draft.origin_id === draft.destination_id) {
    throw new OrderValidationError("Отправление и назначение совпадают");
  }
  if (!context.dist.has(draft.origin_id, draft.destination_id)) {
    throw new OrderValidationError("Между этими пунктами нет известного дорожного маршрута");
  }
  if (!Number.isFinite(draft.weight_kg) || draft.weight_kg <= 0) {
    throw new OrderValidationError("Вес должен быть положительным числом");
  }
  // The largest truck in the fleet is 15 tonnes; a heavier order cannot be served.
  if (draft.weight_kg > 20000) {
    throw new OrderValidationError("Вес больше 20 тонн — такой груз нужно делить на рейсы");
  }
  if (!draft.cargo.trim()) {
    throw new OrderValidationError("Не указан груз");
  }

  const ready = new Date(draft.ready_at);
  const deadline = new Date(draft.deadline_at);
  if (Number.isNaN(ready.getTime()) || Number.isNaN(deadline.getTime())) {
    throw new OrderValidationError("Некорректные даты готовности или срока");
  }
  if (deadline < ready) {
    throw new OrderValidationError("Срок доставки раньше готовности груза");
  }

  const id = `order-${crypto.randomUUID().slice(0, 8)}`;
  const [created] = await db.query<Order>(
    `INSERT INTO orders (
       id, shipper_name, origin_id, destination_id, cargo, weight_kg,
       needs_cooling, ready_at, deadline_at, status, raw_text, parsed_by
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'new',$10,$11)
     RETURNING id, shipper_name, origin_id, destination_id, cargo, weight_kg,
               needs_cooling, ready_at, deadline_at, status, raw_text, parsed_by`,
    [
      id,
      draft.shipper_name.trim() || "Отправитель",
      draft.origin_id,
      draft.destination_id,
      draft.cargo.trim(),
      Math.round(draft.weight_kg),
      draft.needs_cooling,
      ready.toISOString(),
      deadline.toISOString(),
      draft.raw_text ?? null,
      draft.parsed_by ?? null,
    ],
  );

  return { ...created, weight_kg: Number(created.weight_kg) };
}
