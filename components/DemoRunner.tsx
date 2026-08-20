"use client";

import { useCallback, useRef, useState } from "react";

import { MapPanel } from "./MapPanel";
import type { MapArc, MapPin, MapSettlement } from "./RegionMap";
import { Badge, LadenBar, Metric, Surface, buttonClass } from "./ui";
import type { Analytics, TripView } from "@/lib/queries";
import { km, kzt, litres, percent, routeSummary, weight } from "@/lib/format";

/**
 * The scripted demo.
 *
 * It drives the product's own endpoints — nothing here is a recording or a mock.
 * The point is a presentation that survives nerves and a bad room: one button
 * plays the whole story, and if the network dies mid-run the log says exactly
 * which step failed instead of leaving a blank screen.
 */

type StepState = "idle" | "running" | "done" | "failed";

interface LogLine {
  text: string;
  tone: "narrate" | "data" | "error";
}

/** Three consignments too small for a dedicated run, written as real messages. */
const MESSAGES = [
  "Магазину в Сенеке нужно 400 кг стройматериалов. Забрать с базы в Актау",
  "Из Актау в Курык 700 кг бытовой техники, можно на этой неделе",
  "надо 300 кг запчастей из Актау в Жетыбай",
];

export function DemoRunner({
  settlements,
}: {
  settlements: MapSettlement[];
}) {
  const [state, setState] = useState<StepState>("idle");
  const [log, setLog] = useState<LogLine[]>([]);
  const [trip, setTrip] = useState<(TripView & { price_kzt: number }) | null>(null);
  const [stats, setStats] = useState<Analytics | null>(null);
  const [step, setStep] = useState(0);
  const cancelled = useRef(false);

  const say = useCallback((text: string, tone: LogLine["tone"] = "narrate") => {
    setLog((lines) => [...lines, { text, tone }]);
  }, []);

  const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  async function call(url: string, body?: unknown) {
    const response = await fetch(url, {
      method: "POST",
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error ?? `${url} → ${response.status}`);
    return data;
  }

  async function run() {
    cancelled.current = false;
    setState("running");
    setLog([]);
    setTrip(null);
    setStats(null);
    setStep(0);

    try {
      // 1 — known starting state
      setStep(1);
      say("Возвращаем систему в исходное состояние.");
      await call("/api/demo/reset");
      say("Готово: справочные данные области на месте, спрос пересобран.", "data");
      await pause(600);
      if (cancelled.current) return;

      // 2 — three small orders arrive as messages
      setStep(2);
      say("Три магазина в разных сёлах пишут заявки обычными сообщениями.");
      for (const text of MESSAGES) {
        const parsed = await call("/api/orders/parse", { text });
        say(`«${text}»`, "narrate");
        say(
          `→ ${parsed.origin_id ?? "?"} → ${parsed.destination_id ?? "?"}, ${parsed.cargo ?? "?"}, ${parsed.weight_kg ?? "?"} кг`,
          "data",
        );
        await call("/api/orders", { ...parsed, shipper_name: "Магазин", raw_text: text });
        await pause(400);
        if (cancelled.current) return;
      }
      say("По отдельности ни одна из них не оправдывает выезда машины.", "narrate");
      await pause(600);

      // 3 — the engine assembles
      setStep(3);
      say("Движок проходит по пулу заявок и собирает рейсы.");
      const plan = await call("/api/plan");
      say(
        `Собрано ${plan.trips} рейсов, покрыто ${plan.orders_covered} заявок, оплачиваемых километров ${Math.round(plan.paid_km_share * 100)}%.`,
        "data",
      );
      await pause(600);
      if (cancelled.current) return;

      // 4 — find the trip that carries the typed orders
      setStep(4);
      const proposed: (TripView & { price_kzt: number })[] = await (
        await fetch("/api/trips?status=proposed")
      ).json();
      const ours = proposed.find((candidate) => candidate.has_typed_order) ?? proposed[0];
      if (!ours) throw new Error("движок не нашёл ни одного рейса");
      setTrip(ours);
      say(
        `Наши три груза уехали одним рейсом: ${routeSummary([ours.at_name, ...ours.stops.map((s) => s.settlement_name), ours.at_name])}`,
        "data",
      );
      say(
        `Отдельными рейсами вышло бы ${km(ours.baseline_total_km)}, а тут ${km(ours.total_km)}.`,
        "data",
      );
      await pause(900);
      if (cancelled.current) return;

      // 5 — a driver takes it and drives
      setStep(5);
      say("Водитель видит рейс с заработком и берёт его.");
      await call(`/api/trips/${ours.id}/accept`);
      await call(`/api/trips/${ours.id}/start`);
      say(`Взял и выехал. Ориентир по оплате — ${kzt(ours.price_kzt)}.`, "data");
      await pause(500);

      for (const stop of ours.stops) {
        if (cancelled.current) return;
        await call(`/api/stops/${stop.id}/done`);
        say(
          `${stop.settlement_name} — ${stop.action === "pickup" ? "забрал" : "выгрузил"}${stop.cargo ? ` ${stop.cargo}` : ""}`,
          "narrate",
        );
        await pause(350);
      }
      say("Все точки пройдены, отправители видят «доставлено».", "data");
      await pause(600);

      // 6 — what the region got out of it
      setStep(6);
      const finalStats: Analytics = await (await fetch("/api/analytics")).json();
      setStats(finalStats);
      say(
        `Итог по области: оплачиваемых километров ${percent(finalStats.paid_km_share)}, не поехали ${km(finalStats.km_avoided)}, сэкономлено ${litres(finalStats.fuel_saved_l)}.`,
        "data",
      );
      setState("done");
    } catch (error) {
      say(error instanceof Error ? error.message : "неизвестная ошибка", "error");
      setState("failed");
    }
  }

  const arcs: MapArc[] = trip ? tripArcs(trip) : [];
  const pins: MapPin[] = trip ? tripPins(trip) : [];

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1.1fr]">
      <div className="space-y-4">
        <Surface className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-h2 text-ink-900">Демонстрация за минуту</h2>
              <p className="mt-1.5 text-small text-ink-600">
                Три мелких груза в разные села превращаются в один рейс. Всё, что вы увидите,
                делают настоящие функции продукта — заявки создаются, рейс собирается движком,
                водитель его принимает.
              </p>
            </div>
            {state === "done" ? <Badge tone="laden">готово</Badge> : null}
            {state === "running" ? (
              <Badge tone="accent" dot>
                идёт
              </Badge>
            ) : null}
          </div>

          <div className="mt-4 flex gap-2.5">
            <button
              onClick={run}
              disabled={state === "running"}
              className={buttonClass("primary", "md")}
            >
              {state === "running"
                ? `Шаг ${step} из 6…`
                : state === "done"
                  ? "Прогнать заново"
                  : "Запустить демонстрацию"}
            </button>
            {state === "running" ? (
              <button
                onClick={() => {
                  cancelled.current = true;
                  setState("idle");
                }}
                className={buttonClass("ghost", "md")}
              >
                Остановить
              </button>
            ) : null}
          </div>

          {state === "idle" && log.length === 0 ? (
            <p className="mt-3 text-small text-ink-500">
              Займёт около минуты. Данные вернутся в исходное состояние — можно прогонять
              сколько угодно раз.
            </p>
          ) : null}
        </Surface>

        {log.length > 0 ? (
          <Surface className="p-5">
            <ol className="space-y-2">
              {log.map((line, index) => (
                <li
                  key={index}
                  className={`animate-rise text-small ${
                    line.tone === "error"
                      ? "text-danger-ink"
                      : line.tone === "data"
                        ? "font-medium text-ink-900"
                        : "text-ink-600"
                  }`}
                >
                  {line.tone === "data" ? "→ " : ""}
                  {line.text}
                </li>
              ))}
            </ol>
          </Surface>
        ) : null}

        {stats ? (
          <Surface accent className="p-5">
            <div className="grid grid-cols-3 gap-4">
              <Metric
                label="Оплачиваемых км"
                value={percent(stats.paid_km_share)}
                tone="laden"
              />
              <Metric
                label="Не поехали"
                value={km(stats.km_avoided).replace(" км", "")}
                unit="км"
              />
              <Metric
                label="Топливо"
                value={litres(stats.fuel_saved_l).replace(" л", "")}
                unit="л"
                tone="laden"
              />
            </div>
          </Surface>
        ) : null}
      </div>

      <div className="space-y-4">
        <Surface className="overflow-hidden">
          <div className="h-[380px]">
            <MapPanel settlements={settlements} arcs={arcs} pins={pins} labels />
          </div>
        </Surface>

        {trip ? (
          <Surface accent className="animate-rise p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-h3 text-ink-900">
                  {routeSummary([
                    trip.at_name,
                    ...trip.stops.map((stop) => stop.settlement_name),
                    trip.at_name,
                  ])}
                </div>
                <div className="mt-1 text-small text-ink-500">
                  {trip.plate} · {trip.capacity_kg / 1000} т
                </div>
              </div>
              <Badge tone="laden">{kzt(trip.price_kzt)}</Badge>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-3">
              <Metric label="Грузов" value={trip.stops.filter((s) => s.action === "pickup").length} />
              <Metric label="Пробег" value={km(trip.total_km).replace(" км", "")} unit="км" />
              <Metric
                label="Порожний"
                value={km(trip.empty_km).replace(" км", "")}
                unit="км"
                tone={trip.empty_km === 0 ? "laden" : "empty"}
              />
            </div>

            <div className="mt-4">
              <LadenBar ladenKm={trip.laden_km} emptyKm={trip.empty_km} />
            </div>

            <ul className="mt-4 space-y-1.5 border-t border-ink-200 pt-3.5">
              {trip.stops
                .filter((stop) => stop.action === "dropoff")
                .map((stop) => (
                  <li key={stop.id} className="flex justify-between gap-3 text-small">
                    <span className="text-ink-700">{stop.settlement_name}</span>
                    <span className="text-ink-500">
                      {stop.cargo}
                      {stop.weight_kg ? `, ${weight(stop.weight_kg)}` : ""}
                    </span>
                  </li>
                ))}
            </ul>
          </Surface>
        ) : null}
      </div>
    </div>
  );
}

function tripArcs(trip: TripView): MapArc[] {
  const arcs: MapArc[] = [];
  let at: [number, number] = [trip.at_lat, trip.at_lon];
  let load = 0;
  trip.stops.forEach((stop, index) => {
    const to: [number, number] = [stop.lat, stop.lon];
    if (at[0] !== to[0] || at[1] !== to[1]) {
      arcs.push({ id: `demo-${index}`, from: at, to, laden: load > 0, weight: 0.6 });
    }
    load += (stop.action === "pickup" ? 1 : -1) * (stop.weight_kg ?? 0);
    at = to;
  });
  const home: [number, number] = [trip.at_lat, trip.at_lon];
  if (at[0] !== home[0] || at[1] !== home[1]) {
    arcs.push({ id: "demo-return", from: at, to: home, laden: false, weight: 0.6 });
  }
  return arcs;
}

function tripPins(trip: TripView): MapPin[] {
  return [
    { id: "demo-v", lat: trip.at_lat, lon: trip.at_lon, kind: "vehicle", label: trip.plate },
    ...trip.stops.map((stop) => ({
      id: `demo-${stop.id}`,
      lat: stop.lat,
      lon: stop.lon,
      kind: stop.action,
      label: `${stop.seq}. ${stop.settlement_name}`,
    })),
  ];
}
