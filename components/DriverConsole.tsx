"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { MapPanel } from "./MapPanel";
import type { MapArc, MapPin, MapSettlement } from "./RegionMap";
import { Badge, EmptyState, LadenBar, Metric, RouteTimeline, Surface, buttonClass } from "./ui";
import type { OrderView, TripStopView, TripView } from "@/lib/queries";
import { duration, km, kzt, litres, percent, routeSummary, vehicleLabel, weight } from "@/lib/format";
import { ASSUMPTIONS } from "@/lib/engine/economics";

const KIND: Record<TripView["kind"], { label: string; tone: "laden" | "accent" | "neutral" }> = {
  backhaul: { label: "Обратная загрузка", tone: "laden" },
  consolidation: { label: "Консолидация", tone: "accent" },
  "backhaul+consolidation": { label: "Обратная + консолидация", tone: "laden" },
  single: { label: "Одиночный груз", tone: "neutral" },
};

/**
 * Builds the map geometry for one trip.
 *
 * Load is tracked through the stop sequence so each leg can be drawn as laden or
 * empty — that distinction is the whole point of the product, so it has to be
 * visible on the map rather than only in the numbers.
 */
function tripArcs(trip: TripView): MapArc[] {
  const arcs: MapArc[] = [];
  let at: [number, number] = [trip.at_lat, trip.at_lon];
  let load = 0;

  trip.stops.forEach((stop, index) => {
    const to: [number, number] = [stop.lat, stop.lon];
    if (at[0] !== to[0] || at[1] !== to[1]) {
      arcs.push({ id: `${trip.id}-leg-${index}`, from: at, to, laden: load > 0, weight: 0.5 });
    }
    load += (stop.action === "pickup" ? 1 : -1) * (stop.weight_kg ?? 0);
    at = to;
  });

  const home: [number, number] = [trip.at_lat, trip.at_lon];
  if (at[0] !== home[0] || at[1] !== home[1]) {
    arcs.push({ id: `${trip.id}-leg-return`, from: at, to: home, laden: false, weight: 0.5 });
  }
  return arcs;
}

function tripPins(trip: TripView): MapPin[] {
  const pins: MapPin[] = [
    { id: `${trip.id}-vehicle`, lat: trip.at_lat, lon: trip.at_lon, kind: "vehicle", label: trip.plate },
  ];
  for (const stop of trip.stops) {
    pins.push({
      id: stop.id,
      lat: stop.lat,
      lon: stop.lon,
      kind: stop.action,
      seq: stop.seq,
      label: `${stop.seq}. ${stop.settlement_name} — ${stop.action === "pickup" ? "забрать" : "выгрузить"}`,
    });
  }
  return pins;
}

function stopsForTimeline(stops: TripStopView[]) {
  return stops.map((stop) => ({
    id: stop.id,
    seq: stop.seq,
    name: stop.settlement_name,
    action: stop.action,
    done: Boolean(stop.done_at),
    detail: [stop.cargo, stop.weight_kg ? weight(stop.weight_kg) : null, stop.shipper_name]
      .filter(Boolean)
      .join(" · ") || null,
  }));
}

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
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error ?? "Не получилось");
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

export function DriverConsole({
  proposed,
  active,
  unplanned,
  settlements,
  priceOf,
}: {
  proposed: TripView[];
  active: TripView[];
  unplanned: OrderView[];
  settlements: MapSettlement[];
  /** Indicative price per trip id, computed server-side from its fuel. */
  priceOf: Record<string, number>;
}) {
  const shown = active.length > 0 ? active : proposed;
  const [selectedId, setSelectedId] = useState<string | null>(shown[0]?.id ?? null);
  const selected = shown.find((trip) => trip.id === selectedId) ?? shown[0] ?? null;
  const { run, busy, error } = useAction();

  const { arcs, pins } = useMemo(() => {
    if (!selected) return { arcs: [] as MapArc[], pins: [] as MapPin[] };
    return { arcs: tripArcs(selected), pins: tripPins(selected) };
  }, [selected]);

  return (
    <div className="flex flex-col-reverse lg:h-[calc(100vh-3.5rem)] lg:flex-row">
      {/* List — first in the DOM on mobile so a driver lands on the offers. */}
      <div className="flex w-full flex-col border-ink-200 lg:w-[27rem] lg:shrink-0 lg:border-r xl:w-[30rem]">
        <div className="flex items-center justify-between gap-3 border-b border-ink-200 px-4 py-3">
          <div>
            <h1 className="text-h3 text-ink-900">
              {active.length > 0 ? "Мой рейс" : "Доступные рейсы"}
            </h1>
            <p className="text-small text-ink-500">
              {active.length > 0
                ? "Отмечайте точки по мере выполнения"
                : `${proposed.length} собрано движком из ${proposed.reduce((sum, t) => sum + new Set(t.stops.map((s) => s.order_id)).size, 0)} заявок`}
            </p>
          </div>
          <button onClick={() => run("/api/plan")} disabled={busy} className={buttonClass("secondary", "sm")}>
            {busy ? "Собираю…" : "Пересобрать"}
          </button>
        </div>

        {error ? <div className="px-4 pt-3 text-small text-danger">{error}</div> : null}

        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          {unplanned.length > 0 ? <UnplannedStrip orders={unplanned} /> : null}

          {shown.length === 0 ? (
            <EmptyState title="Рейсов пока нет">
              Нажмите «Пересобрать» — движок пройдёт по пулу заявок и соберёт рейсы заново.
            </EmptyState>
          ) : null}

          {shown.map((trip) =>
            active.length > 0 ? (
              <ActiveTripCard key={trip.id} trip={trip} price={priceOf[trip.id] ?? 0} />
            ) : (
              <ProposalCard
                key={trip.id}
                trip={trip}
                price={priceOf[trip.id] ?? 0}
                selected={selected?.id === trip.id}
                onSelect={() => setSelectedId(trip.id)}
              />
            ),
          )}
        </div>
      </div>

      {/* Map */}
      <div className="relative h-[45vh] w-full lg:h-auto lg:flex-1">
        <MapPanel settlements={settlements} arcs={arcs} pins={pins} labels />
        {selected ? <MapLegend trip={selected} /> : null}
      </div>
    </div>
  );
}

function UnplannedStrip({ orders }: { orders: OrderView[] }) {
  return (
    <Surface accent className="p-3.5">
      <div className="flex items-center gap-2">
        <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-brand" />
        <span className="text-caption uppercase text-brand">Ждут подбора машины</span>
      </div>
      <ul className="mt-2.5 space-y-1.5">
        {orders.map((order) => (
          <li key={order.id} className="flex items-baseline justify-between gap-3 text-small">
            <span className="min-w-0 truncate text-ink-700">
              {order.origin_name} → {order.destination_name}
            </span>
            <span className="shrink-0 tnum text-ink-500">
              {order.cargo}, {weight(order.weight_kg)}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-2.5 text-[0.6875rem] text-ink-500">
        Нажмите «Пересобрать», чтобы движок включил их в рейсы.
      </p>
    </Surface>
  );
}

function ProposalCard({
  trip,
  price,
  selected,
  onSelect,
}: {
  trip: TripView;
  price: number;
  selected: boolean;
  onSelect: () => void;
}) {
  const { run, busy, error } = useAction();
  const orderCount = new Set(trip.stops.map((s) => s.order_id).filter(Boolean)).size;
  const kind = KIND[trip.kind];
  const summary = routeSummary([trip.at_name, ...trip.stops.map((s) => s.settlement_name), trip.at_name]);

  return (
    <Surface
      accent={selected}
      interactive
      className={`animate-rise cursor-pointer p-4 ${selected ? "ring-1 ring-brand-border/50" : ""}`}
    >
      <div onClick={onSelect}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {trip.has_typed_order ? (
              <div className="mb-1.5">
                <Badge tone="accent" dot>
                  Здесь ваша заявка
                </Badge>
              </div>
            ) : null}
            <div className="text-[0.9375rem] font-semibold leading-snug text-ink-900">{summary}</div>
            <div className="mt-1 text-small text-ink-500">
              {trip.plate} · {trip.capacity_kg / 1000} т {vehicleLabel(trip.vehicle_kind)}
            </div>
          </div>
          <Badge tone={kind.tone}>{kind.label}</Badge>
        </div>

        <div className="mt-3.5 grid grid-cols-3 gap-3">
          <Metric label="Заработок" value={kzt(price).replace(" ₸", "")} unit="₸" tone="accent" />
          <Metric label="Грузов" value={orderCount} sub={duration(trip.minutes)} />
          <Metric
            label="Порожний"
            value={km(trip.empty_km).replace(" км", "")}
            unit="км"
            tone={trip.empty_km === 0 ? "laden" : "empty"}
          />
        </div>

        <p className="mt-2 text-[0.6875rem] text-ink-500">
          Ориентир: топливо {litres(trip.fuel_l)} × {ASSUMPTIONS.dieselPriceKztPerL} ₸ ÷{" "}
          {ASSUMPTIONS.fuelShareOfOperatingCost} — итоговую цену стороны согласуют сами
        </p>

        <div className="mt-3.5">
          <LadenBar ladenKm={trip.laden_km} emptyKm={trip.empty_km} />
        </div>

        <p className="mt-3 rounded-control bg-ink-50 px-3 py-2.5 text-small text-ink-400">
          {trip.explanation}
        </p>
      </div>

      <button
        onClick={() => run(`/api/trips/${trip.id}/accept`)}
        disabled={busy}
        className={`mt-3.5 ${buttonClass("primary", "lg")}`}
      >
        {busy ? "Беру рейс…" : `Взять рейс · ${kzt(price)}`}
      </button>
      {error ? <p className="mt-1.5 text-small text-danger">{error}</p> : null}
    </Surface>
  );
}

function ActiveTripCard({ trip, price }: { trip: TripView; price: number }) {
  const { run, busy, error } = useAction();
  const next = trip.stops.find((stop) => !stop.done_at);
  const remaining = trip.stops.filter((stop) => !stop.done_at).length;
  const started = trip.status === "in_transit";

  return (
    <Surface accent className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[0.9375rem] font-semibold text-ink-900">
            {routeSummary([trip.at_name, ...trip.stops.map((s) => s.settlement_name), trip.at_name])}
          </div>
          <div className="mt-1 text-small text-ink-500">
            {trip.plate} · {km(trip.total_km)} · {duration(trip.minutes)}
          </div>
        </div>
        <Badge tone={started ? "accent" : "neutral"} dot={started}>
          {started ? "В пути" : "Принят"}
        </Badge>
      </div>

      <div className="mt-3.5 grid grid-cols-3 gap-3">
        <Metric label="Заработок" value={kzt(price).replace(" ₸", "")} unit="₸" tone="accent" />
        <Metric label="Оплачиваемых" value={percent(trip.paid_km_share)} tone="laden" />
        <Metric
          label="Осталось точек"
          value={remaining}
          sub={remaining === 0 ? "рейс завершён" : undefined}
        />
      </div>

      {!started ? (
        <button
          onClick={() => run(`/api/trips/${trip.id}/start`)}
          disabled={busy}
          className={`mt-4 ${buttonClass("primary", "lg")}`}
        >
          {busy ? "Начинаю…" : "Выехал"}
        </button>
      ) : next ? (
        <div className="mt-4 rounded-control border border-brand-border/50 bg-brand-soft p-3.5">
          <div className="text-caption uppercase text-brand">Следующая точка</div>
          <div className="mt-1 text-h3 text-ink-900">{next.settlement_name}</div>
          <div className="text-small text-ink-400">
            {next.action === "pickup" ? "Забрать" : "Выгрузить"}
            {next.cargo ? ` ${next.cargo}` : ""}
            {next.weight_kg ? `, ${weight(next.weight_kg)}` : ""}
          </div>
          <button
            onClick={() => run(`/api/stops/${next.id}/done`)}
            disabled={busy}
            className={`mt-3 ${buttonClass("primary", "lg")}`}
          >
            {busy ? "…" : next.action === "pickup" ? "Забрал" : "Доставил"}
          </button>
        </div>
      ) : (
        <p className="mt-4 rounded-control bg-laden-soft px-3 py-2.5 text-small text-laden-ink">
          Все точки пройдены. Рейс завершён: {km(trip.total_km)}, порожний {km(trip.empty_km)},
          экономия {litres(trip.fuel_saved_l)}.
        </p>
      )}
      {error ? <p className="mt-1.5 text-small text-danger">{error}</p> : null}

      <div className="mt-4 border-t border-ink-200 pt-3.5">
        <RouteTimeline stops={stopsForTimeline(trip.stops)} origin={trip.at_name} />
      </div>
    </Surface>
  );
}

/** Explains the two line styles, so the map is readable without a caption. */
function MapLegend({ trip }: { trip: TripView }) {
  return (
    <div className="pointer-events-none absolute bottom-3 left-3 rounded-control border border-ink-200 bg-white/95 px-3 py-2.5 backdrop-blur">
      <div className="flex items-center gap-4 text-[0.6875rem]">
        <span className="flex items-center gap-1.5 text-laden-ink">
          <span className="h-0.5 w-5 rounded bg-laden" /> с грузом
        </span>
        <span className="flex items-center gap-1.5 text-empty-ink">
          <span className="h-0.5 w-5 rounded border-t-2 border-dashed border-empty-ink" /> порожний
        </span>
      </div>
      <div className="mt-1.5 tnum text-[0.6875rem] text-ink-500">
        {km(trip.total_km)} · порожний {km(trip.empty_km)} · оплачиваемых {percent(trip.paid_km_share)}
      </div>
    </div>
  );
}
