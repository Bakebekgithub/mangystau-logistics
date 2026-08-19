import { NewOrderForm } from "@/components/NewOrderForm";
import { Badge, Card, Empty, RoleNav, SectionTitle } from "@/components/ui";
import { listSettlements, listTypedOrders } from "@/lib/queries";
import { km, weight, when } from "@/lib/format";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, { text: string; tone: "neutral" | "info" | "value" }> = {
  new: { text: "ищем машину", tone: "neutral" },
  matched: { text: "машина найдена", tone: "info" },
  in_transit: { text: "в пути", tone: "info" },
  delivered: { text: "доставлено", tone: "value" },
  expired: { text: "срок истёк", tone: "neutral" },
};

export default async function ShipperPage() {
  const [settlements, orders] = await Promise.all([listSettlements(), listTypedOrders()]);

  return (
    <>
      <RoleNav current="shipper" />
      <main className="mx-auto max-w-4xl space-y-6 px-4 py-6">
        <NewOrderForm
          settlements={settlements.map((s) => ({ id: s.id, name_ru: s.name_ru, name_kz: s.name_kz }))}
        />

        <section>
          <SectionTitle hint="Заявки, которые вы разместили сообщением. Остальной поток области — на вкладке акимата.">
            Мои заявки
          </SectionTitle>

          {orders.length === 0 ? (
            <Empty>
              Пока ни одной заявки. Напишите сообщение выше — например, «надо 3 тонны арматуры
              из Актау в Жанаозен завтра до обеда».
            </Empty>
          ) : (
            <div className="space-y-3">
              {orders.map((order) => {
                const status = STATUS_LABEL[order.status] ?? { text: order.status, tone: "neutral" as const };
                return (
                  <Card key={order.id}>
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <div className="font-medium text-sand-900">
                          {order.origin_name} → {order.destination_name}
                        </div>
                        <div className="mt-0.5 text-sm text-sand-700">
                          {order.cargo}, {weight(order.weight_kg)}
                          {order.needs_cooling ? " · рефрижератор" : ""}
                          {order.km !== null ? ` · ${km(order.km)}` : ""}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge tone={status.tone}>{status.text}</Badge>
                        <Badge>{order.parsed_by === "ai" ? "ИИ" : "словарь"}</Badge>
                      </div>
                    </div>

                    <div className="mt-2 text-xs text-sand-600">
                      готов {when(order.ready_at)} · срок {when(order.deadline_at)}
                    </div>

                    {order.raw_text ? (
                      <p className="mt-2 rounded-lg bg-sand-50 p-2 text-xs italic text-sand-600">
                        «{order.raw_text}»
                      </p>
                    ) : null}
                  </Card>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </>
  );
}
