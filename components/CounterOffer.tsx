"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { buttonClass } from "./ui";
import { kzt } from "@/lib/format";

/**
 * The carrier has named a different figure; the shipper answers here.
 *
 * Haggling is how this market clears today — a call, a number, a yes or a no.
 * Keeping it inside the order card means the agreed price ends up in the data
 * rather than in someone's WhatsApp history.
 */
export function CounterOffer({ orderId, price }: { orderId: string; price: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function accept() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/orders/${orderId}/accept-counter`, { method: "POST" });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error ?? "Не получилось");
      }
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-2.5 rounded-control border border-empty-border bg-empty-soft px-3 py-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <span className="text-small text-empty-ink">
          Перевозчик просит <span className="tnum font-semibold">{kzt(price)}</span>
        </span>
        <button
          onClick={accept}
          disabled={busy || pending}
          className={buttonClass("primary", "sm")}
        >
          {busy || pending ? "…" : "Согласиться"}
        </button>
      </div>
      {error ? <p className="mt-1.5 text-small text-danger">{error}</p> : null}
    </div>
  );
}
