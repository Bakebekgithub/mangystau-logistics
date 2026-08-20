"use client";

import { useState } from "react";

import { Badge, Surface, buttonClass } from "./ui";
import { kzt, weight } from "@/lib/format";

interface SettlementOption {
  id: string;
  name_ru: string;
}

interface Candidate {
  order: {
    id: string;
    cargo: string;
    weight_kg: number;
    shipper_name: string;
    origin_name: string;
    destination_name: string;
  };
  detour_km: number;
  detour_fuel_l: number;
  pays_kzt: number;
  net_kzt: number;
  leg: "along" | "back";
}

interface Result {
  corridor_km: number;
  along: Candidate[];
  back: Candidate[];
}

/**
 * «Я уже еду туда, и у меня пусто» — the case a noticeboard cannot serve.
 *
 * A carrier with his own deal is not shopping for a trip; he wants cargo that
 * fits the trip he already has. So he states the corridor and the space, and the
 * engine ranks the pool by what he clears after diesel — not by the biggest
 * number, because a fat offer a hundred kilometres off the road is worth less
 * than a modest one on it.
 *
 * Nothing is reserved by looking. The consignments stay in the pool until he
 * takes one, which is why this screen only reads.
 */
export function TopUpPanel({
  settlements,
  kind,
  capacityKg,
}: {
  settlements: SettlementOption[];
  /** Body type from the carrier's profile — the offers have to suit it. */
  kind: string;
  capacityKg: number;
}) {
  const [open, setOpen] = useState(false);
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [freeKg, setFreeKg] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function search() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const response = await fetch("/api/topup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          origin_id: origin,
          destination_id: destination,
          free_kg: Number(freeKg),
          capacity_kg: capacityKg,
          kind,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Не получилось");
      setResult(data as Result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  }

  const ready = origin && destination && origin !== destination && Number(freeKg) > 0;

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full rounded-control border border-dashed border-ink-300 px-3.5 py-3 text-left transition hover:border-brand-border hover:bg-brand-soft"
      >
        <span className="block text-small font-medium text-ink-900">
          Уже едете куда-то? Доберите груз
        </span>
        <span className="mt-0.5 block text-[0.6875rem] text-ink-500">
          Свой рейс, свободное место в кузове — найдём, что взять по пути и на обратную дорогу
        </span>
      </button>
    );
  }

  return (
    <Surface className="p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-small font-semibold text-ink-900">Доберу груз в свой рейс</h3>
          <p className="mt-0.5 text-[0.6875rem] text-ink-500">
            Порожние километры вы уже едете. Осталось решить, что на них везти.
          </p>
        </div>
        <button onClick={() => setOpen(false)} className={buttonClass("ghost", "sm")}>
          Свернуть
        </button>
      </div>

      <div className="mt-3 grid gap-2.5 sm:grid-cols-3">
        <label className="block">
          <span className="text-caption uppercase text-ink-500">Откуда</span>
          <select value={origin} onChange={(e) => setOrigin(e.target.value)} className={`${INPUT} mt-1`}>
            <option value="">— выберите —</option>
            {settlements.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name_ru}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-caption uppercase text-ink-500">Куда</span>
          <select
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            className={`${INPUT} mt-1`}
          >
            <option value="">— выберите —</option>
            {settlements.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name_ru}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-caption uppercase text-ink-500">Свободно, кг</span>
          <input
            type="text"
            inputMode="numeric"
            value={freeKg}
            onChange={(e) => setFreeKg(e.target.value.replace(/[^\d]/g, ""))}
            placeholder="3000"
            className={`${INPUT} tnum mt-1`}
          />
        </label>
      </div>

      <button
        onClick={search}
        disabled={busy || !ready}
        className={`mt-3 ${buttonClass("primary", "md")} w-full`}
      >
        {busy ? "Ищу…" : "Найти груз"}
      </button>

      {error ? <p className="mt-2 text-small text-danger">{error}</p> : null}

      {result ? (
        <div className="mt-3.5 space-y-3.5">
          <p className="text-[0.6875rem] text-ink-500">
            Ваш маршрут — <span className="tnum">{Math.round(result.corridor_km)} км</span>. Ниже —
            что можно взять, отсортировано по тому, сколько останется после топлива на крюк.
          </p>

          <Leg
            title="По пути"
            hint={`влезает в свободные ${weight(Number(freeKg))}`}
            candidates={result.along}
            empty="По пути ничего подходящего нет."
          />
          <Leg
            title="На обратную дорогу"
            hint="обратно кузов свободен целиком"
            candidates={result.back}
            empty="Обратного груза пока нет."
          />
        </div>
      ) : null}
    </Surface>
  );
}

function Leg({
  title,
  hint,
  candidates,
  empty,
}: {
  title: string;
  hint: string;
  candidates: Candidate[];
  empty: string;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-caption uppercase text-ink-500">{title}</span>
        <span className="text-[0.6875rem] text-ink-500">{hint}</span>
      </div>

      {candidates.length === 0 ? (
        <p className="mt-1.5 text-small text-ink-500">{empty}</p>
      ) : (
        <ul className="mt-1.5 space-y-2">
          {candidates.map((candidate) => (
            <li key={candidate.order.id} className="rounded-control bg-ink-50 px-3 py-2.5">
              <div className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 truncate text-small font-medium text-ink-900">
                  {candidate.order.origin_name} → {candidate.order.destination_name}
                </span>
                <span className="tnum shrink-0 text-small font-semibold text-laden-ink">
                  +{kzt(candidate.net_kzt)}
                </span>
              </div>
              <div className="mt-0.5 truncate text-[0.6875rem] text-ink-500">
                {candidate.order.cargo} · {weight(candidate.order.weight_kg)} ·{" "}
                {candidate.order.shipper_name}
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.6875rem] text-ink-500">
                <span className="tnum">платят {kzt(candidate.pays_kzt)}</span>
                <span className="tnum">
                  крюк {candidate.detour_km === 0 ? "без крюка" : `+${candidate.detour_km} км`}
                </span>
                {candidate.detour_fuel_l > 0 ? (
                  <span className="tnum">топливо на крюк {candidate.detour_fuel_l} л</span>
                ) : null}
                {candidate.detour_km < 5 ? <Badge tone="laden">почти по пути</Badge> : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const INPUT =
  "block w-full rounded-control border border-ink-300 bg-white px-2.5 py-1.5 text-small " +
  "text-ink-900 placeholder:text-ink-600 transition focus:border-brand-border focus:outline-none";
