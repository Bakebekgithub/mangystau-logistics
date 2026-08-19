"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

/** Posts to an endpoint, then refreshes the server-rendered page. */
function useAction() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(url: string) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(url, { method: "POST" });
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

  return { run, busy: busy || pending, error };
}

export function AcceptTripButton({ tripId }: { tripId: string }) {
  const { run, busy, error } = useAction();
  return (
    <div>
      <button
        onClick={() => run(`/api/trips/${tripId}/accept`)}
        disabled={busy}
        className="w-full rounded-lg bg-laden px-4 py-3 text-base font-semibold text-white transition hover:brightness-110 disabled:opacity-40"
      >
        {busy ? "Беру…" : "Взять рейс"}
      </button>
      {error ? <p className="mt-1 text-xs text-empty">{error}</p> : null}
    </div>
  );
}

export function StartTripButton({ tripId }: { tripId: string }) {
  const { run, busy, error } = useAction();
  return (
    <div>
      <button
        onClick={() => run(`/api/trips/${tripId}/start`)}
        disabled={busy}
        className="w-full rounded-lg bg-caspian-600 px-4 py-3 text-base font-semibold text-white transition hover:bg-caspian-700 disabled:opacity-40"
      >
        {busy ? "Начинаю…" : "Выехал"}
      </button>
      {error ? <p className="mt-1 text-xs text-empty">{error}</p> : null}
    </div>
  );
}

export function CompleteStopButton({ stopId, label }: { stopId: string; label: string }) {
  const { run, busy, error } = useAction();
  return (
    <div>
      <button
        onClick={() => run(`/api/stops/${stopId}/done`)}
        disabled={busy}
        className="rounded-lg bg-sand-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-sand-800 disabled:opacity-40"
      >
        {busy ? "…" : label}
      </button>
      {error ? <p className="mt-1 text-xs text-empty">{error}</p> : null}
    </div>
  );
}

/**
 * Runs a planning cycle. This is the dispatcher's action rather than a driver's,
 * but it lives here because the driver screen is where its effect is visible.
 */
export function ReplanButton() {
  const { run, busy, error } = useAction();
  return (
    <div className="text-right">
      <button
        onClick={() => run("/api/plan")}
        disabled={busy}
        className="rounded-lg border border-sand-300 bg-white px-3 py-1.5 text-sm text-sand-700 transition hover:bg-sand-100 disabled:opacity-40"
      >
        {busy ? "Собираю рейсы…" : "Пересобрать рейсы"}
      </button>
      {error ? <p className="mt-1 text-xs text-empty">{error}</p> : null}
    </div>
  );
}
