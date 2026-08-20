"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { MapPanel } from "./MapPanel";
import type { MapArc, MapPin, MapSettlement } from "./RegionMap";
import { Badge, EmptyState, LadenBar, Metric, RouteTimeline, Surface, buttonClass } from "./ui";
import type { OrderView, TripStopView, TripView } from "@/lib/queries";
import { duration, km, kzt, litres, percent, routeSummary, vehicleLabel, weight } from "@/lib/format";
import { bodyFitsCargo, BODY_ACCEPTS_LABEL } from "@/lib/engine/cargo-fit";
import { ASSUMPTIONS } from "@/lib/engine/economics";
import type { VehicleKind } from "@/lib/types";

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
  let atName = trip.at_name;
  let load = 0;
  let aboard: string[] = [];

  trip.stops.forEach((stop, index) => {
    const to: [number, number] = [stop.lat, stop.lon];
    if (at[0] !== to[0] || at[1] !== to[1]) {
      // Naming both ends and what is in the body makes the leg readable on its
      // own. A line whose only property is a colour leaves the viewer guessing
      // which way the truck is going and why that stretch is paid.
      const cargoNote = aboard.length > 0 ? `в кузове: ${aboard.join(", ")}` : "порожний";
      arcs.push({
        id: `${trip.id}-leg-${index}`,
        from: at,
        to,
        laden: load > 0,
        weight: 0.5,
        arrow: true,
        label: `${atName} → ${stop.settlement_name} · ${cargoNote}`,
      });
    }

    if (stop.action === "pickup") {
      load += stop.weight_kg ?? 0;
      if (stop.cargo) aboard.push(stop.cargo);
    } else {
      load -= stop.weight_kg ?? 0;
      aboard = aboard.filter((cargo) => cargo !== stop.cargo);
    }
    at = to;
    atName = stop.settlement_name;
  });

  const home: [number, number] = [trip.at_lat, trip.at_lon];
  if (at[0] !== home[0] || at[1] !== home[1]) {
    arcs.push({
      id: `${trip.id}-leg-return`,
      from: at,
      to: home,
      laden: false,
      weight: 0.5,
      arrow: true,
      label: `${atName} → ${trip.at_name} · возврат на базу, порожний`,
    });
  }
  return arcs;
}

/**
 * One pin per settlement on the route, not one per stop.
 *
 * A trip picks up two consignments in the same town often enough, and two labels
 * stacked on one dot read as a rendering fault. Stops at the same place are
 * merged, keeping their numbers so the order is still legible: "2–3 Бейнеу".
 */
function tripPins(trip: TripView): MapPin[] {
  const bySettlement = new Map<string, { stops: TripStopView[]; lat: number; lon: number }>();
  for (const stop of trip.stops) {
    const entry = bySettlement.get(stop.settlement_id);
    if (entry) entry.stops.push(stop);
    else bySettlement.set(stop.settlement_id, { stops: [stop], lat: stop.lat, lon: stop.lon });
  }

  const pins: MapPin[] = [
    {
      id: `${trip.id}-vehicle`,
      lat: trip.at_lat,
      lon: trip.at_lon,
      kind: "vehicle",
      label: "Старт",
      permanentLabel: true,
    },
  ];

  for (const [settlementId, entry] of bySettlement) {
    const seqs = entry.stops.map((s) => s.seq).sort((a, b) => a - b);
    const numbers = seqs.length > 2 ? `${seqs[0]}–${seqs[seqs.length - 1]}` : seqs.join("–");
    const actions = new Set(entry.stops.map((s) => s.action));
    // Kept short on purpose: labels have no collision avoidance, and the action
    // at each stop is spelled out in the route timeline on the card anyway.
    pins.push({
      id: `${trip.id}-stop-${settlementId}`,
      lat: entry.lat,
      lon: entry.lon,
      kind: actions.has("pickup") ? "pickup" : "dropoff",
      seq: seqs[0],
      label: `${numbers} ${entry.stops[0]!.settlement_name}`,
      permanentLabel: true,
    });
  }

  return pins;
}

/** Settlements the route already names, so the map does not print them twice. */
function tripNamedSettlements(trip: TripView): string[] {
  return [...new Set(trip.stops.map((stop) => stop.settlement_id))];
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

  return {
    run,
    busy: busy || pending,
    error,
    refresh: () => startTransition(() => router.refresh()),
  };
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
  const [profile, setProfile] = useState<VehicleProfile>(DEFAULT_PROFILE);

  // Read the saved profile after mount rather than during render: the server has
  // no localStorage, and a mismatch there is a hydration error.
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(PROFILE_KEY);
      if (saved) setProfile({ ...DEFAULT_PROFILE, ...JSON.parse(saved) });
    } catch {
      /* Corrupt or unavailable storage: the default profile stands. */
    }
  }, []);

  function changeProfile(next: VehicleProfile) {
    setProfile(next);
    try {
      window.localStorage.setItem(PROFILE_KEY, JSON.stringify(next));
    } catch {
      /* Private mode. The filter still works for this session. */
    }
  }

  // A trip was planned for a particular truck, so a truck at least that big can
  // certainly run it. Beyond weight, every consignment aboard has to suit the
  // body: a tipper is not carrying bottled water, whatever its tonnage.
  const fits = (trip: TripView) =>
    trip.capacity_kg <= profile.capacity_kg &&
    trip.stops.every((stop) => !stop.cargo || bodyFitsCargo(profile.kind, stop.cargo));

  const offers = proposed.filter(fits);
  const hidden = proposed.length - offers.length;

  // Both lists are shown at once. Hiding the offers behind an active trip meant a
  // driver mid-route could not see what else was available, and an order placed
  // seconds earlier appeared nowhere at all.
  const shown = [...active, ...offers];
  const [selectedId, setSelectedId] = useState<string | null>(shown[0]?.id ?? null);
  const selected = shown.find((trip) => trip.id === selectedId) ?? shown[0] ?? null;
  const { run, busy, error } = useAction();

  const { arcs, pins, named } = useMemo(() => {
    if (!selected) return { arcs: [] as MapArc[], pins: [] as MapPin[], named: [] as string[] };
    return {
      arcs: tripArcs(selected),
      pins: tripPins(selected),
      named: tripNamedSettlements(selected),
    };
  }, [selected]);

  return (
    <div className="flex flex-col-reverse lg:h-[calc(100vh-3.5rem)] lg:flex-row">
      {/* List — first in the DOM on mobile so a driver lands on the offers. */}
      <div className="flex w-full flex-col border-ink-200 lg:w-[27rem] lg:shrink-0 lg:border-r xl:w-[30rem]">
        <div className="flex items-center justify-between gap-3 border-b border-ink-200 px-4 py-3">
          <div>
            <h1 className="text-h3 text-ink-900">Рейсы</h1>
            <p className="text-small text-ink-500">
              {active.length > 0 ? `${active.length} в работе · ` : ""}
              {offers.length} под вашу машину
              {hidden > 0 ? ` · ${hidden} не подходит` : ""}
            </p>
          </div>
          <button onClick={() => run("/api/plan")} disabled={busy} className={buttonClass("secondary", "sm")}>
            {busy ? "Собираю…" : "Пересобрать"}
          </button>
        </div>

        <ProfileBar profile={profile} onChange={changeProfile} />

        {error ? <div className="px-4 pt-3 text-small text-danger">{error}</div> : null}

        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          {unplanned.length > 0 ? <UnplannedStrip orders={unplanned} /> : null}

          {active.length === 0 && offers.length === 0 ? (
            <EmptyState title={hidden > 0 ? "Под вашу машину рейсов нет" : "Рейсов пока нет"}>
              {hidden > 0
                ? `${hidden} рейс${hidden === 1 ? "" : "а"} не под этот кузов — ${BODY_ACCEPTS_LABEL[profile.kind]}. Поменяйте машину выше или нажмите «Пересобрать».`
                : "Нажмите «Пересобрать» — движок пройдёт по пулу заявок и соберёт рейсы заново."}
            </EmptyState>
          ) : null}

          {active.length > 0 ? (
            <>
              <div className="pt-1 text-caption uppercase text-ink-500">В работе</div>
              {active.map((trip) => (
                <ActiveTripCard key={trip.id} trip={trip} />
              ))}
            </>
          ) : null}

          {offers.length > 0 ? (
            <>
              <div className="pt-2 text-caption uppercase text-ink-500">
                Доступные рейсы · {offers.length}
              </div>
              {offers.map((trip) => (
                <ProposalCard
                  key={trip.id}
                  trip={trip}
                  price={priceOf[trip.id] ?? 0}
                  selected={selected?.id === trip.id}
                  onSelect={() => setSelectedId(trip.id)}
                />
              ))}
            </>
          ) : null}
        </div>
      </div>

      {/* Map */}
      <div className="relative h-[45vh] w-full lg:h-auto lg:flex-1">
        <MapPanel settlements={settlements} arcs={arcs} pins={pins} namedElsewhere={named} labels />
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
  const { run, busy, error, refresh } = useAction();
  const orderCount = new Set(trip.stops.map((s) => s.order_id).filter(Boolean)).size;
  const fuelCost = Math.round(trip.fuel_l * ASSUMPTIONS.dieselPriceKztPerL);
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
          <Metric label="Платят" value={kzt(trip.revenue_kzt).replace(" ₸", "")} unit="₸" tone="accent" />
          <Metric label="Топливо" value={kzt(fuelCost).replace(" ₸", "")} unit="₸" tone="empty" />
          <Metric
            label="Порожний"
            value={km(trip.empty_km).replace(" км", "")}
            unit="км"
            tone={trip.empty_km === 0 ? "laden" : "empty"}
          />
        </div>

        <p className="mt-2 text-[0.6875rem] text-ink-500">
          {orderCount} груз{orderCount === 1 ? "" : orderCount < 5 ? "а" : "ов"} ·{" "}
          {duration(trip.minutes)} · топливо {litres(trip.fuel_l)} × {ASSUMPTIONS.dieselPriceKztPerL} ₸.
          Рекомендованный минимум платформы за такой рейс — {kzt(price)}.
        </p>

        <CargoBreakdown trip={trip} onChanged={refresh} />

        <div className="mt-3.5">
          <LadenBar ladenKm={trip.laden_km} emptyKm={trip.empty_km} />
        </div>

        <p className="mt-3 rounded-control bg-ink-50 px-3 py-2.5 text-small text-ink-600">
          {trip.explanation}
        </p>

        <p className="mt-2 text-[0.6875rem] text-ink-500">
          Телефоны отправителей откроются, как только вы возьмёте рейс.
        </p>
      </div>

      <button
        onClick={() => run(`/api/trips/${trip.id}/accept`)}
        disabled={busy}
        className={`mt-3.5 ${buttonClass("primary", "lg")}`}
      >
        {busy ? "Беру рейс…" : `Взять рейс · ${kzt(trip.revenue_kzt)}`}
      </button>
      {error ? <p className="mt-1.5 text-small text-danger">{error}</p> : null}
    </Surface>
  );
}

function ActiveTripCard({ trip }: { trip: TripView }) {
  const { run, busy, error, refresh } = useAction();
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
        <Metric label="Платят" value={kzt(trip.revenue_kzt).replace(" ₸", "")} unit="₸" tone="accent" />
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
          <div className="text-small text-ink-600">
            {next.action === "pickup" ? "Забрать" : "Выгрузить"}
            {next.cargo ? ` ${next.cargo}` : ""}
            {next.weight_kg ? `, ${weight(next.weight_kg)}` : ""}
          </div>
          {next.shipper_phone ? (
            <a href={telHref(next.shipper_phone)} className={`mt-3 ${buttonClass("secondary", "md")} w-full`}>
              Позвонить{next.shipper_name ? ` · ${next.shipper_name}` : ""} · {next.shipper_phone}
            </a>
          ) : null}
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

      <CargoBreakdown trip={trip} onChanged={refresh} />

      <Contacts trip={trip} />

      <div className="mt-4 border-t border-ink-200 pt-3.5">
        <RouteTimeline stops={stopsForTimeline(trip.stops)} origin={trip.at_name} />
      </div>
    </Surface>
  );
}

/** A phone number as a link the phone dials. Spaces break `tel:` on some dialers. */
function telHref(phone: string): string {
  return `tel:${phone.replace(/[^+\d]/g, "")}`;
}

/**
 * Who to ring, per consignment.
 *
 * Only on an accepted trip: before a driver commits, they see the cargo and the
 * route but not the shipper's number. Freight still moves on a phone call, so
 * this is part of the working loop rather than a later "account" feature.
 */
function Contacts({ trip }: { trip: TripView }) {
  const pickups = trip.stops.filter((stop) => stop.action === "pickup" && stop.shipper_name);
  if (pickups.length === 0) return null;

  return (
    <div className="mt-4 border-t border-ink-200 pt-3.5">
      <div className="text-caption uppercase text-ink-500">Контакты по грузам</div>
      <ul className="mt-2 space-y-2">
        {pickups.map((stop) => (
          <li key={`contact-${stop.id}`} className="flex items-baseline justify-between gap-3 text-small">
            <span className="min-w-0 truncate text-ink-700">
              {stop.shipper_name}
              <span className="text-ink-500"> · {stop.settlement_name}</span>
            </span>
            {stop.shipper_phone ? (
              <a
                href={telHref(stop.shipper_phone)}
                className="tnum shrink-0 font-medium text-brand underline decoration-brand/30 underline-offset-2 hover:decoration-brand"
              >
                {stop.shipper_phone}
              </a>
            ) : (
              <span className="shrink-0 text-ink-500">телефон не указан</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}


/**
 * What this trip is made of, leg by leg, with the money attached to each.
 *
 * A driver on the phone today knows exactly what he is carrying, from where to
 * where, and for how much. A single trip total hides all three, so the card
 * shows the same breakdown he would write on paper — and lets him refuse one
 * consignment or name his own figure for it without losing the rest of the trip.
 */
function CargoBreakdown({ trip, onChanged }: { trip: TripView; onChanged: () => void }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [bid, setBid] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const editable = trip.status === "proposed";

  const pickups = trip.stops.filter((stop) => stop.action === "pickup" && stop.order_id);
  if (pickups.length === 0) return null;

  async function call(url: string, body?: unknown, orderId?: string) {
    setBusyId(orderId ?? url);
    setError(null);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: body ? { "content-type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error ?? "Не получилось");
      }
      setEditing(null);
      setBid("");
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="mt-3 border-t border-ink-200 pt-3" onClick={(event) => event.stopPropagation()}>
      <div className="flex items-baseline justify-between">
        <span className="text-caption uppercase text-ink-500">Что и за сколько</span>
        <span className="tnum text-caption text-ink-500">итого {kzt(trip.revenue_kzt)}</span>
      </div>

      <ul className="mt-2 space-y-2.5">
        {pickups.map((stop) => {
          const drop = trip.stops.find(
            (other) => other.order_id === stop.order_id && other.action === "dropoff",
          );
          const busyHere = busyId === stop.order_id;
          return (
            <li key={`leg-${stop.id}`} className="rounded-control bg-ink-50 px-3 py-2.5">
              <div className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 truncate text-small font-medium text-ink-900">
                  {stop.settlement_name} → {drop?.settlement_name ?? "—"}
                </span>
                <span className="tnum shrink-0 text-small font-semibold text-ink-900">
                  {stop.offered_price_kzt ? kzt(stop.offered_price_kzt) : "цена не указана"}
                </span>
              </div>

              <div className="mt-0.5 flex items-baseline justify-between gap-3 text-[0.6875rem] text-ink-500">
                <span className="min-w-0 truncate">
                  <span className={stop.is_typed ? "font-semibold text-brand" : undefined}>
                    {stop.cargo}
                  </span>
                  {stop.weight_kg ? ` · ${weight(stop.weight_kg)}` : ""}
                  {stop.shipper_name ? ` · ${stop.shipper_name}` : ""}
                </span>
                {stop.is_typed ? (
                  <span className="shrink-0 rounded-pill bg-brand-soft px-1.5 py-0.5 font-medium text-brand">
                    ваша заявка
                  </span>
                ) : null}
              </div>

              {stop.price_status === "countered" && stop.counter_price_kzt ? (
                <p className="tnum mt-1.5 text-[0.6875rem] text-warn">
                  вы предложили {kzt(stop.counter_price_kzt)} — ждём ответа заказчика
                </p>
              ) : null}
              {stop.price_status === "agreed" ? (
                <p className="mt-1.5 text-[0.6875rem] text-laden-ink">цена согласована</p>
              ) : null}

              {editable && editing === stop.order_id ? (
                <div className="mt-2 flex items-center gap-2">
                  <input
                    autoFocus
                    type="text"
                    inputMode="numeric"
                    value={bid}
                    onChange={(event) => setBid(event.target.value.replace(/[^\d]/g, ""))}
                    placeholder={String(stop.offered_price_kzt ?? "")}
                    className="tnum w-28 rounded-control border border-ink-300 bg-white px-2.5 py-1.5 text-small text-ink-900 focus:border-brand-border focus:outline-none"
                  />
                  <span className="text-small text-ink-600">₸</span>
                  <button
                    disabled={busyHere || !bid}
                    onClick={() => call(`/api/orders/${stop.order_id}/counter`, { price: Number(bid) }, stop.order_id!)}
                    className={buttonClass("primary", "sm")}
                  >
                    {busyHere ? "…" : "Предложить"}
                  </button>
                  <button onClick={() => setEditing(null)} className={buttonClass("ghost", "sm")}>
                    Отмена
                  </button>
                </div>
              ) : editable ? (
                <div className="mt-2 flex items-center gap-2">
                  <button
                    onClick={() => {
                      setEditing(stop.order_id);
                      setBid(String(stop.offered_price_kzt ?? ""));
                    }}
                    className={buttonClass("secondary", "sm")}
                  >
                    Своя цена
                  </button>
                  <button
                    disabled={busyHere}
                    onClick={() =>
                      call(`/api/trips/${trip.id}/orders/${stop.order_id}/remove`, undefined, stop.order_id!)
                    }
                    className="rounded-control px-2.5 py-1.5 text-small text-ink-600 transition hover:bg-white hover:text-danger"
                  >
                    {busyHere ? "…" : "Не беру"}
                  </button>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>

      {error ? <p className="mt-2 text-small text-danger">{error}</p> : null}
      {editable ? (
        <p className="mt-2 text-[0.6875rem] text-ink-500">
          Уберёте груз — маршрут и цифры пересчитаются, остальные грузы останутся за вами.
        </p>
      ) : null}
    </div>
  );
}


/**
 * The carrier's own truck.
 *
 * Offers were previously shown regardless of what the driver drives, which is
 * wrong in the one way that matters: a Gazelle owner scrolling past ten-tonne
 * loads concludes the product is not for him. Kept in the browser rather than in
 * an account, because the MVP has no sign-in and this is a device preference.
 */
interface VehicleProfile {
  kind: VehicleKind;
  capacity_kg: number;
}

const PROFILE_KEY = "mangystau.vehicle-profile";
const DEFAULT_PROFILE: VehicleProfile = { kind: "tent", capacity_kg: 10000 };

const PROFILE_KINDS: readonly { value: VehicleKind; label: string }[] = [
  { value: "tent", label: "Тент" },
  { value: "refrigerator", label: "Рефрижератор" },
  { value: "flatbed", label: "Бортовая" },
  { value: "tipper", label: "Самосвал" },
];

const PROFILE_CAPACITIES = [3000, 5000, 10000, 15000] as const;

function ProfileBar({
  profile,
  onChange,
}: {
  profile: VehicleProfile;
  onChange: (next: VehicleProfile) => void;
}) {
  return (
    <div className="border-b border-ink-200 bg-ink-50 px-4 py-2.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="text-caption uppercase text-ink-500">Моя машина</span>
        <select
          value={profile.kind}
          onChange={(event) => onChange({ ...profile, kind: event.target.value as VehicleKind })}
          className={SELECT}
        >
          {PROFILE_KINDS.map((kind) => (
            <option key={kind.value} value={kind.value}>
              {kind.label}
            </option>
          ))}
        </select>
        <select
          value={profile.capacity_kg}
          onChange={(event) => onChange({ ...profile, capacity_kg: Number(event.target.value) })}
          className={SELECT}
        >
          {PROFILE_CAPACITIES.map((capacity) => (
            <option key={capacity} value={capacity}>
              {capacity / 1000} т
            </option>
          ))}
        </select>
        <span className="text-[0.6875rem] text-ink-500">
          — {BODY_ACCEPTS_LABEL[profile.kind]}, до {profile.capacity_kg / 1000} т
        </span>
      </div>
    </div>
  );
}

const SELECT =
  "rounded-control border border-ink-300 bg-white px-2.5 py-1.5 text-small text-ink-900 " +
  "transition focus:border-brand-border focus:outline-none";

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
        <span className="flex items-center gap-1.5 text-ink-600">
          <svg width="14" height="9" viewBox="0 0 14 9" fill="none" aria-hidden>
            <path d="M1 4.5h9M7.5 1.5 10.5 4.5 7.5 7.5" stroke="currentColor" strokeWidth="1.6"
                  strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          куда едет
        </span>
      </div>
      <div className="mt-1.5 tnum text-[0.6875rem] text-ink-500">
        {km(trip.total_km)} · порожний {km(trip.empty_km)} · оплачиваемых {percent(trip.paid_km_share)}
      </div>
      <div className="mt-1 text-[0.6875rem] text-ink-500">
        Цифры у точек — порядок остановок. Наведите на линию — покажет, что в кузове.
      </div>
    </div>
  );
}
