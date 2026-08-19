import { NextResponse } from "next/server";

import { parseOrderText } from "@/lib/orders";

/** Nothing here is cacheable — every request parses fresh input. */
export const dynamic = "force-dynamic";

/**
 * Parses a free-text message into a draft order without writing anything.
 *
 * The shipper confirms the result on screen before it becomes a real order.
 */
export async function POST(request: Request) {
  let body: { text?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ожидается JSON" }, { status: 400 });
  }

  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text) {
    return NextResponse.json({ error: "Пустое сообщение" }, { status: 400 });
  }
  if (text.length > 2000) {
    return NextResponse.json({ error: "Сообщение слишком длинное" }, { status: 400 });
  }

  const parsed = await parseOrderText(text);
  return NextResponse.json(parsed);
}
