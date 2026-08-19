import { OrderComposer } from "@/components/OrderComposer";
import { Badge, EmptyState, Metric, SectionHead, Surface, TopBar } from "@/components/ui";
import { km, weight, when } from "@/lib/format";
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
          <h1 className="text-h1 text-ink-50">Что с моими грузами</h1>
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
                return (
                  <Surface key={order.id} interactive className="animate-rise p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-[0.9375rem] font-semibold text-ink-50">
                          {order.origin_name} → {order.destination_name}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-small text-ink-400">
                          <span>{order.cargo}</span>
                          <span className="tnum">{weight(order.weight_kg)}</span>
                          {order.km !== null ? <span className="tnum">{km(order.km)}</span> : null}
                          {order.needs_cooling ? <span className="text-accent">рефрижератор</span> : null}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <Badge tone={status.tone} dot={order.status === "in_transit"}>
                          {status.label}
                        </Badge>
                      </div>
                    </div>

                    <div className="mt-2.5 text-[0.6875rem] text-ink-500">
                      готов {when(order.ready_at)} · срок {when(order.deadline_at)} ·{" "}
                      {order.parsed_by === "ai" ? "разобрано ИИ" : "разобрано по словарю"}
                    </div>

                    {order.raw_text ? (
                      <p className="mt-2.5 border-l-2 border-ink-750 pl-3 text-small italic text-ink-500">
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
