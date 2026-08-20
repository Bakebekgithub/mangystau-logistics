import { CounterOffer } from "@/components/CounterOffer";
import { OrderComposer } from "@/components/OrderComposer";
import { Badge, EmptyState, Metric, SectionHead, Surface, TopBar } from "@/components/ui";
import { BODY_LABEL } from "@/lib/engine/cargo-fit";
import { recommendedOrderPriceKzt } from "@/lib/engine/economics";
import { km, kzt, weight, when } from "@/lib/format";
import { listSettlements, listTypedOrders, type OrderView } from "@/lib/queries";

export const dynamic = "force-dynamic";

const STATUS: Record<OrderView["status"], { label: string; tone: "neutral" | "accent" | "laden" | "warn" }> = {
  new: { label: "Ищем машину", tone: "warn" },
  matched: { label: "Машина найдена", tone: "accent" },
  in_transit: { label: "В пути", tone: "accent" },
  delivered: { label: "Доставлено", tone: "laden" },
  expired: { label: "Срок истёк", tone: "neutral" },
};

export default async function ShipperPage() {
  const [settlements, orders] = await Promise.all([listSettlements(), listTypedOrders()]);

  const counts = {
    searching: orders.filter((o) => o.status === "new").length,
    moving: orders.filter((o) => o.status === "matched" || o.status === "in_transit").length,
    delivered: orders.filter((o) => o.status === "delivered").length,
  };

  return (
    <>
      <TopBar current="shipper" />
      <main className="mx-auto max-w-4xl space-y-7 px-4 py-6">
        <section>
          <h1 className="text-h1 text-ink-900">Что с моими грузами</h1>
          <div className="mt-4 grid grid-cols-3 gap-3">
            <Surface className="p-4">
              <Metric label="Ищем машину" value={counts.searching} tone={counts.searching > 0 ? "empty" : "neutral"} />
            </Surface>
            <Surface className="p-4">
              <Metric label="В работе" value={counts.moving} tone={counts.moving > 0 ? "accent" : "neutral"} />
            </Surface>
            <Surface className="p-4">
              <Metric label="Доставлено" value={counts.delivered} tone={counts.delivered > 0 ? "laden" : "neutral"} />
            </Surface>
          </div>
        </section>

        <OrderComposer
          settlements={settlements.map((s) => ({ id: s.id, name_ru: s.name_ru, name_kz: s.name_kz }))}
        />

        <section>
          <SectionHead
            title="Мои заявки"
            hint="Размещённые вами сообщением. Остальной поток области — во вкладке диспетчера."
          />

          {orders.length === 0 ? (
            <EmptyState title="Заявок пока нет">
              Напишите сообщение выше или нажмите один из примеров — заявка появится здесь.
            </EmptyState>
          ) : (
            <div className="space-y-2.5">
              {orders.map((order) => {
                const status = STATUS[order.status];
                // An order nobody has picked up may simply be underpriced. The
                // engine refuses trips that do not cover their diesel, so saying
                // "ищем машину" and nothing else leaves the shipper waiting for
                // something that will never happen.
                const floor =
                  order.km !== null ? recommendedOrderPriceKzt(order.km, order.weight_kg).price_kzt : null;
                const underpriced =
                  order.status === "new" &&
                  !order.carrier_plate &&
                  floor !== null &&
                  order.offered_price_kzt !== null &&
                  order.offered_price_kzt < floor;
                return (
                  <Surface key={order.id} interactive className="animate-rise p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-[0.9375rem] font-semibold text-ink-900">
                          {order.origin_name} → {order.destination_name}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-small text-ink-500">
                          <span>{order.cargo}</span>
                          <span className="tnum">{weight(order.weight_kg)}</span>
                          {order.km !== null ? <span className="tnum">{km(order.km)}</span> : null}
                          {order.needs_cooling ? <span className="text-brand">нужен холод</span> : null}
                          {order.required_kind ? (
                            <span className="text-brand">только {BODY_LABEL[order.required_kind]}</span>
                          ) : null}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <Badge
                          tone={
                            order.status === "new" && order.trip_status === "proposed"
                              ? "accent"
                              : status.tone
                          }
                          dot={order.status === "in_transit"}
                        >
                          {order.status === "new" && order.trip_status === "proposed"
                            ? "Машина подобрана"
                            : status.label}
                        </Badge>
                      </div>
                    </div>

                    <div className="mt-2.5 text-[0.6875rem] text-ink-500">
                      готов {when(order.ready_at)} · срок {when(order.deadline_at)} ·{" "}
                      {order.parsed_by === "ai" ? "разобрано ИИ" : "разобрано по словарю"}
                    </div>

                    {order.offered_price_kzt ? (
                      <div className="mt-2.5 flex items-baseline gap-2 text-small">
                        <span className="text-ink-500">
                          {order.price_status === "agreed" ? "Согласовано:" : "Ваша цена:"}
                        </span>
                        <span className="tnum font-semibold text-ink-900">
                          {kzt(order.offered_price_kzt)}
                        </span>
                      </div>
                    ) : null}

                    {underpriced && floor !== null ? (
                      <div className="mt-2.5 rounded-control border border-warn-border bg-warn-soft px-3 py-2.5 text-small text-warn">
                        Перевозчики не берут: ваша цена ниже рекомендованного минимума{" "}
                        <span className="tnum font-semibold">{kzt(floor)}</span>. Ниже неё рейс
                        не окупает даже топливо, поэтому движок его не предлагает.
                      </div>
                    ) : null}

                    {order.price_status === "countered" && order.counter_price_kzt ? (
                      <CounterOffer
                        orderId={order.id}
                        price={order.counter_price_kzt}
                        ownPrice={order.offered_price_kzt}
                      />
                    ) : null}

                    {order.carrier_plate && order.trip_status === "proposed" ? (
                      <div className="mt-3 flex items-center gap-2.5 rounded-control border border-brand-border bg-brand-soft px-3 py-2.5">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-[0.6875rem] font-bold text-brand">
                          {order.carrier_plate.slice(0, 3)}
                        </span>
                        <span className="min-w-0 text-small">
                          <span className="block font-medium text-ink-900">
                            {order.carrier_name}
                          </span>
                          <span className="block text-ink-600">
                            {order.carrier_plate} · рейс собран, ждём подтверждения перевозчика
                          </span>
                        </span>
                      </div>
                    ) : null}

                    {order.carrier_plate && order.trip_status !== "proposed" ? (
                      <div className="mt-3 flex items-center gap-2.5 rounded-control border border-laden-border bg-laden-soft px-3 py-2.5">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-[0.6875rem] font-bold text-laden-ink">
                          {order.carrier_plate.slice(0, 3)}
                        </span>
                        <span className="min-w-0 flex-1 text-small">
                          <span className="block font-medium text-ink-900">
                            {order.carrier_name}
                          </span>
                          <span className="block text-ink-600">
                            {order.carrier_plate} ·{" "}
                            {order.status === "in_transit"
                              ? "уже в пути"
                              : order.status === "delivered"
                                ? "доставлено"
                                : "принял заявку"}
                            {order.carrier_phone ? (
                              <span className="tnum"> · {order.carrier_phone}</span>
                            ) : null}
                          </span>
                        </span>
                        {/* The number opens once a carrier has committed, not before. */}
                        {order.carrier_phone ? (
                          <a
                            href={`tel:${order.carrier_phone.replace(/[^+\d]/g, "")}`}
                            className="tnum shrink-0 rounded-control border border-laden-border bg-white px-3 py-1.5 text-small font-medium text-laden-ink transition hover:border-laden"
                          >
                            Позвонить
                          </a>
                        ) : null}
                      </div>
                    ) : null}

                    {order.raw_text ? (
                      <p className="mt-2.5 border-l-2 border-ink-200 pl-3 text-small italic text-ink-500">
                        {order.raw_text}
                      </p>
                    ) : null}
                  </Surface>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </>
  );
}
