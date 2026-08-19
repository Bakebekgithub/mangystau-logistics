"use client";

import { useMemo, useState } from "react";

import { BeforeAfterBars, RankedBars, UnitTrack } from "./charts";
import { MapPanel } from "./MapPanel";
import type { MapArc, MapPin, MapSettlement } from "./RegionMap";
import { Badge, LadenBar, Metric, Surface } from "./ui";
import type { Analytics, FlowLine, TripView } from "@/lib/queries";
import { km, kzt, litres, percent } from "@/lib/format";

type Layer = "flows" | "trips" | "empty";

const LAYERS: { key: Layer; label: string; hint: string }[] = [
  { key: "flows", label: "Грузопоток", hint: "Куда и сколько возят — по всем заявкам области" },
  { key: "trips", label: "Собранные рейсы", hint: "Маршруты, которые построил движок" },
  { key: "empty", label: "Порожние участки", hint: "Где машины идут без груза" },
];

/**
 * The dispatcher's view: one map, one question at a time.
 *
 * The layer switch exists because these three questions want different geometry
 * on the same canvas, and drawing them together produces a hairball rather than
 * an answer.
 */
export function DispatcherBoard({
  stats,
  flows,
  trips,
  settlements,
}: {
  stats: Analytics;
  flows: FlowLine[];
  trips: TripView[];
  settlements: MapSettlement[];
}) {
  const [layer, setLayer] = useState<Layer>("flows");

  const { arcs, pins } = useMemo(() => {
    if (layer === "flows") {
      const busiest = Math.max(1, ...flows.map((flow) => flow.shipments));
      return {
        arcs: flows.map((flow) => ({
          id: `${flow.from_id}-${flow.to_id}`,
          from: [flow.from_lat, flow.from_lon] as [number, number],
          to: [flow.to_lat, flow.to_lon] as [number, number],
          laden: true,
          weight: flow.shipments / busiest,
          label: `${flow.from_name} — ${flow.to_name}: ${flow.shipments} отправок, ${flow.tonnes} т`,
        })),
        pins: [] as MapPin[],
      };
    }

    const arcs: MapArc[] = [];
    const pins: MapPin[] = [];

    for (const trip of trips) {
      let at: [number, number] = [trip.at_lat, trip.at_lon];
      let load = 0;
      pins.push({
        id: `${trip.id}-v`,
        lat: trip.at_lat,
        lon: trip.at_lon,
        kind: "vehicle",
        label: trip.plate,
      });

      trip.stops.forEach((stop, index) => {
        const to: [number, number] = [stop.lat, stop.lon];
        const laden = load > 0;
        if ((at[0] !== to[0] || at[1] !== to[1]) && (layer === "trips" || !laden)) {
          arcs.push({
            id: `${trip.id}-${index}`,
            from: at,
            to,
            laden,
            weight: 0.4,
            label: `${trip.plate}: ${laden ? "с грузом" : "порожний"}`,
          });
        }
        load += (stop.action === "pickup" ? 1 : -1) * (stop.weight_kg ?? 0);
        at = to;
      });

      const home: [number, number] = [trip.at_lat, trip.at_lon];
      if (at[0] !== home[0] || at[1] !== home[1]) {
        arcs.push({
          id: `${trip.id}-return`,
          from: at,
          to: home,
          laden: false,
          weight: 0.4,
          label: `${trip.plate}: возврат порожним`,
        });
      }
    }

    return { arcs, pins: layer === "trips" ? pins : [] };
  }, [layer, flows, trips]);

  const corridors = useMemo(
    () =>
      flows.slice(0, 7).map((flow) => ({
        id: `${flow.from_id}-${flow.to_id}`,
        label: `${flow.from_name} — ${flow.to_name}`,
        value: flow.shipments,
        note: `${flow.tonnes} т`,
      })),
    [flows],
  );

  const emptyLegs = useMemo(() => {
    const byTrip = trips
      .filter((trip) => trip.empty_km > 0)
      .sort((a, b) => b.empty_km - a.empty_km)
      .slice(0, 6)
      .map((trip) => ({
        id: trip.id,
        label: `${trip.at_name} · ${trip.plate}`,
        value: Math.round(trip.empty_km),
        note: `из ${Math.round(trip.total_km)} км рейса`,
      }));
    return byTrip;
  }, [trips]);

  const ladenKm = stats.planned_km - stats.planned_empty_km;

  return (
    <div className="flex flex-col lg:h-[calc(100vh-3.5rem)] lg:flex-row">
      {/* Map */}
      <div className="relative order-2 h-[55vh] w-full lg:order-1 lg:h-auto lg:flex-1">
        <MapPanel settlements={settlements} arcs={arcs} pins={pins} labels />

        <div className="absolute left-3 top-3 flex flex-wrap gap-1 rounded-control border border-ink-750 bg-ink-950/85 p-1 backdrop-blur">
          {LAYERS.map((option) => (
            <button
              key={option.key}
              onClick={() => setLayer(option.key)}
              title={option.hint}
              className={`rounded-[7px] px-2.5 py-1.5 text-small font-medium transition ${
                layer === option.key
                  ? "bg-ink-750 text-ink-50"
                  : "text-ink-400 hover:text-ink-200"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="pointer-events-none absolute bottom-3 left-3 max-w-xs rounded-control border border-ink-750 bg-ink-950/85 px-3 py-2.5 backdrop-blur">
          <p className="text-[0.6875rem] text-ink-400">
            {LAYERS.find((option) => option.key === layer)?.hint}
          </p>
          <div className="mt-1.5 flex items-center gap-3 text-[0.6875rem]">
            <span className="flex items-center gap-1.5 text-laden-ink">
              <span className="h-0.5 w-4 rounded" style={{ background: "#11A896" }} /> с грузом
            </span>
            <span className="flex items-center gap-1.5 text-empty-ink">
              <span className="h-0 w-4 border-t-2 border-dashed" style={{ borderColor: "#DD6B12" }} />
              порожний
            </span>
          </div>
        </div>
      </div>

      {/* Analytics */}
      <div className="order-1 w-full space-y-3 overflow-y-auto border-ink-800 p-4 lg:order-2 lg:w-[25rem] lg:shrink-0 lg:border-l xl:w-[27rem]">
        <div>
          <h1 className="text-h2 text-ink-50">Грузопоток области</h1>
          <p className="mt-1 text-small text-ink-400">
            {stats.trips} рейсов · {stats.orders_covered} из {stats.orders_total} заявок
          </p>
        </div>

        <Surface className="p-4">
          <div className="flex items-baseline justify-between gap-3">
            <Metric
              label="Оплачиваемых километров"
              value={percent(stats.paid_km_share)}
              tone="laden"
              size="lg"
            />
            <Badge tone="laden">потолок {percent(stats.paid_km_ceiling_without_pairing)}</Badge>
          </div>
          <div className="mt-3.5">
            <LadenBar ladenKm={ladenKm} emptyKm={stats.planned_empty_km} />
          </div>
          <p className="mt-3 text-small text-ink-400">
            Чистая арифметика по собранным рейсам: машина, которая везёт груз в одну сторону
            и возвращается порожней, не может превысить половину.
          </p>
        </Surface>

        <Surface className="p-4">
          <h2 className="text-h3 text-ink-50">Пробег: сегодня и по плану</h2>
          <p className="mt-1 text-small text-ink-500">
            Сравнение с текущим состоянием региона, где порожний пробег около 40% — цифра
            из кейса, не наша.
          </p>
          <div className="mt-4">
            <BeforeAfterBars
              before={{
                label: "Как сейчас",
                laden: stats.payload_km,
                empty: stats.today_km - stats.payload_km,
              }}
              after={{ label: "По плану", laden: ladenKm, empty: stats.planned_empty_km }}
            />
          </div>
        </Surface>

        <div className="grid grid-cols-2 gap-3">
          <Surface className="p-4">
            <Metric
              label="Топливо"
              value={litres(stats.fuel_saved_l).replace(" л", "")}
              unit="л"
              sub={kzt(stats.money_saved_kzt)}
              tone="laden"
            />
          </Surface>
          <Surface className="p-4">
            <Metric
              label="Не поехали"
              value={km(stats.km_avoided).replace(" км", "")}
              unit="км"
              sub={`из ${km(stats.today_km)}`}
            />
          </Surface>
        </div>

        <Surface className="p-4">
          <UnitTrack
            served={stats.orders_covered}
            total={stats.orders_total}
            label="Заявки области"
          />
          <p className="mt-3 text-small text-ink-400">
            Из них {stats.small_remote_served} — мелкие грузы до тонны дальше 100 км в село:
            именно те, что на бирже остались бы без отклика.
          </p>
        </Surface>

        <Surface className="p-4">
          <h2 className="text-h3 text-ink-50">Загруженные направления</h2>
          <p className="mt-1 text-small text-ink-500">Сколько отправок по коридору</p>
          <div className="mt-3.5">
            <RankedBars items={corridors} unit="отпр." hue="accent" />
          </div>
        </Surface>

        <Surface className="p-4">
          <h2 className="text-h3 text-ink-50">Где остаётся порожний пробег</h2>
          <p className="mt-1 text-small text-ink-500">
            Рейсы, которым движок не нашёл обратной загрузки — здесь не хватает встречных грузов
          </p>
          <div className="mt-3.5">
            <RankedBars items={emptyLegs} unit="км" hue="empty" />
          </div>
        </Surface>
      </div>
    </div>
  );
}
