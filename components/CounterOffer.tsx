"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { buttonClass } from "./ui";
import { kzt } from "@/lib/format";

/**
 * The carrier has named a different figure; the shipper answers here.
 *
 * Three answers, because a real negotiation has three: agree, name your own
 * number, or refuse and stand by your price. A lone "agree" button would make
 * the carrier's figure effectively final, which is not how this market works —
 * on the phone either side can move, and the last word belongs to whoever pays.
 *
 * Whatever is settled ends up in the data rather than in someone's WhatsApp.
 */
export function CounterOffer({
  orderId,
  price,
  ownPrice,
}: {
  orderId: string;
  /** What the carrier is asking. */
  price: number;
  /** What the shipper offered before the counter; prefilled when they haggle back. */
  ownPrice: number | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [bid, setBid] = useState("");

  async function call(path: string, body?: unknown) {
    setBusy(path);
    setError(null);
    try {
      const response = await fetch(`/api/orders/${orderId}/${path}`, {
        method: "POST",
        headers: body ? { "content-type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error ?? "Не получилось");
      }
      setEditing(false);
      setBid("");
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setBusy(null);
    }
  }

  const working = busy !== null || pending;

  return (
    <div className="mt-2.5 rounded-control border border-empty-border bg-empty-soft px-3 py-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <span className="text-small text-empty-ink">
          Перевозчик просит <span className="tnum font-semibold">{kzt(price)}</span>
        </span>

        {editing ? (
          <span className="flex items-center gap-2">
            <input
              autoFocus
              type="text"
              inputMode="numeric"
              value={bid}
              onChange={(event) => setBid(event.target.value.replace(/[^\d]/g, ""))}
              placeholder={String(ownPrice ?? "")}
              className="tnum w-28 rounded-control border border-ink-300 bg-white px-2.5 py-1.5 text-small text-ink-900 focus:border-brand-border focus:outline-none"
            />
            <span className="text-small text-ink-600">₸</span>
            <button
              disabled={working || !bid}
              onClick={() => call("price", { price: Number(bid) })}
              className={buttonClass("primary", "sm")}
            >
              {busy === "price" ? "…" : "Предложить"}
            </button>
            <button onClick={() => setEditing(false)} className={buttonClass("ghost", "sm")}>
              Отмена
            </button>
          </span>
        ) : (
          <span className="flex items-center gap-2">
            <button
              disabled={working}
              onClick={() => call("accept-counter")}
              className={buttonClass("primary", "sm")}
            >
              {busy === "accept-counter" ? "…" : "Согласиться"}
            </button>
            <button
              disabled={working}
              onClick={() => {
                setBid(String(ownPrice ?? ""));
                setEditing(true);
              }}
              className={buttonClass("secondary", "sm")}
            >
              Своя цена
            </button>
            <button
              disabled={working}
              onClick={() => call("decline-counter")}
              className="rounded-control px-2.5 py-1.5 text-small text-ink-600 transition hover:bg-white hover:text-danger"
            >
              {busy === "decline-counter" ? "…" : "Отказать"}
            </button>
          </span>
        )}
      </div>

      {!editing ? (
        <p className="mt-1.5 text-[0.6875rem] text-ink-500">
          Откажете — в заявке останется ваша цена{ownPrice ? ` ${kzt(ownPrice)}` : ""}, и перевозчик
          решает сам: везти за неё или отдать груз другому.
        </p>
      ) : null}

      {error ? <p className="mt-1.5 text-small text-danger">{error}</p> : null}
    </div>
  );
}
