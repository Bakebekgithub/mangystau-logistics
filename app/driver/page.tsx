import { AcceptTripButton, CompleteStopButton, ReplanButton, StartTripButton } from "@/components/TripActions";
import { Badge, Card, Empty, PaidBar, RoleNav, SectionTitle, Stat } from "@/components/ui";
import { listTrips, type TripView } from "@/lib/queries";
import { duration, km, kzt, litres, percent, vehicleLabel, weight } from "@/lib/format";

export const dynamic = "force-dynamic";

const KIND_LABEL: Record<string, string> = {
  backhaul: "обратная загрузка",
  consolidation: "консолидация мелких грузов",
  "backhaul+consolidation": "обратная загрузка + консолидация",
  single: "одиночный груз",
};

export default async function DriverPage() {
  const [proposed, accepted, inTransit] = await Promise.all([
    listTrips("proposed"),
    listTrips("accepted"),
    listTrips("in_transit"),
  ]);
  const mine = [...inTransit, ...accepted];

  return (
    <>
      <RoleNav current="driver" />
      <main className="mx-auto max-w-3xl space-y-6 px-4 py-6">
        {mine.length > 0 ? (
          <section>
            <SectionTitle hint="Отмечайте точки по мере выполнения — отправитель видит статус груза.">
              Мой рейс
            </SectionTitle>
            {mine.map((trip) => (
              <ActiveTrip key={trip.id} trip={trip} />
            ))}
          </section>
        ) : null}

        <section>
          <div className="flex items-end justify-between gap-3">
            <SectionTitle hint="Каждый рейс собран из нескольких заявок. Порожний пробег указан честно.">
              Предложения рейсов
            </SectionTitle>
            <ReplanButton />
          </div>

          {proposed.length === 0 ? (
            <Empty>
              Свободных рейсов нет. Нажмите «Пересобрать рейсы» — движок пройдёт по пулу заявок
              заново.
            </Empty>
          ) : (
            <div className="space-y-4">
              {proposed.map((trip) => (
                <ProposedTrip key={trip.id} trip={trip} />
              ))}
            </div>
          )}
        </section>
      </main>
    </>
  );
}

function RouteLine({ trip }: { trip: TripView }) {
  return (
    <ol className="mt-3 space-y-1.5">
      {trip.stops.map((stop) => (
        <li key={stop.id} className="flex items-start gap-2 text-sm">
          <span
            className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white ${
              stop.action === "pickup" ? "bg-caspian-600" : "bg-sand-700"
            }`}
            aria-hidden
          >
            {stop.seq}
          </span>
          <span className="flex-1">
            <span className="font-medium text-sand-900">{stop.settlement_name}</span>
            <span className="text-sand-600">
              {" "}
              — {stop.action === "pickup" ? "забрать" : "выгрузить"}
              {stop.cargo ? ` ${stop.cargo}` : ""}
              {stop.weight_kg ? `, ${weight(stop.weight_kg)}` : ""}
            </span>
            {stop.done_at ? <span className="ml-1 text-laden">✓</span> : null}
          </span>
        </li>
      ))}
    </ol>
  );
}

function ProposedTrip({ trip }: { trip: TripView }) {
  const orderCount = new Set(trip.stops.map((s) => s.order_id).filter(Boolean)).size;

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="text-base font-semibold text-sand-900">
            {trip.stops[0]?.settlement_name} → {trip.stops[trip.stops.length - 1]?.settlement_name}
          </div>
          <div className="mt-0.5 text-sm text-sand-600">
            {trip.plate} · {trip.capacity_kg / 1000} т {vehicleLabel(trip.vehicle_kind)} · {trip.carrier_name}
          </div>
        </div>
        <Badge tone={trip.empty_km === 0 ? "value" : "info"}>{KIND_LABEL[trip.kind] ?? trip.kind}</Badge>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Грузов" value={orderCount} />
        <Stat label="Пробег" value={km(trip.total_km)} sub={duration(trip.minutes)} />
        <Stat label="Порожний" value={km(trip.empty_km)} tone={trip.empty_km === 0 ? "value" : "loss"} />
        <Stat label="Оплачиваемых км" value={percent(trip.paid_km_share)} tone="value" />
      </div>

      <div className="mt-3">
        <PaidBar ladenKm={trip.laden_km} emptyKm={trip.empty_km} />
      </div>

      <RouteLine trip={trip} />

      <div className="mt-3 rounded-lg bg-sand-50 p-3">
        <div className="text-xs uppercase tracking-wide text-sand-500">Почему этот рейс</div>
        <p className="mt-1 text-sm text-sand-800">{trip.explanation}</p>
        <p className="mt-2 text-xs text-sand-600">
          Отдельными рейсами вышло бы {km(trip.baseline_total_km)}, из них порожних{" "}
          {km(trip.baseline_empty_km)}. Экономия {litres(trip.fuel_saved_l)} и{" "}
          {kzt(trip.money_saved_kzt)}.
        </p>
      </div>

      <div className="mt-4">
        <AcceptTripButton tripId={trip.id} />
      </div>
    </Card>
  );
}

function ActiveTrip({ trip }: { trip: TripView }) {
  const nextStop = trip.stops.find((stop) => !stop.done_at);
  const remaining = trip.stops.filter((stop) => !stop.done_at).length;

  return (
    <Card className="border-caspian-300">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="text-base font-semibold text-sand-900">
            {trip.plate} · {km(trip.total_km)} · {duration(trip.minutes)}
          </div>
          <div className="mt-0.5 text-sm text-sand-600">
            порожний пробег {km(trip.empty_km)} · оплачиваемых {percent(trip.paid_km_share)}
          </div>
        </div>
        <Badge tone={trip.status === "in_transit" ? "info" : "neutral"}>
          {trip.status === "in_transit" ? "в пути" : "принят"}
        </Badge>
      </div>

      {trip.status === "accepted" ? (
        <div className="mt-4">
          <StartTripButton tripId={trip.id} />
        </div>
      ) : null}

      {trip.status === "in_transit" && nextStop ? (
        <div className="mt-4 rounded-lg border border-caspian-200 bg-caspian-50 p-4">
          <div className="text-xs uppercase tracking-wide text-caspian-700">Следующая точка</div>
          <div className="mt-1 text-lg font-semibold text-sand-900">{nextStop.settlement_name}</div>
          <div className="text-sm text-sand-700">
            {nextStop.action === "pickup" ? "Забрать" : "Выгрузить"}
            {nextStop.cargo ? ` ${nextStop.cargo}` : ""}
            {nextStop.weight_kg ? `, ${weight(nextStop.weight_kg)}` : ""}
            {nextStop.shipper_name ? ` · ${nextStop.shipper_name}` : ""}
          </div>
          <div className="mt-3">
            <CompleteStopButton
              stopId={nextStop.id}
              label={nextStop.action === "pickup" ? "Забрал ✓" : "Доставил ✓"}
            />
          </div>
          <div className="mt-2 text-xs text-sand-600">осталось точек: {remaining}</div>
        </div>
      ) : null}

      <RouteLine trip={trip} />
    </Card>
  );
}
