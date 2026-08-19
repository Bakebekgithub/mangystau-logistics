import Link from "next/link";

import { MapPanel } from "@/components/MapPanel";
import { Badge, LadenBar, LinkButton, Logo, Metric, Surface } from "@/components/ui";
import { ASSUMPTIONS } from "@/lib/engine/economics";
import { km, kzt, litres, percent } from "@/lib/format";
import { analytics, listFlows, listSettlements } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [stats, flows, settlements] = await Promise.all([
    analytics(),
    listFlows(),
    listSettlements(),
  ]);

  const busiest = Math.max(1, ...flows.map((flow) => flow.shipments));
  const arcs = flows.slice(0, 26).map((flow) => ({
    id: `${flow.from_id}-${flow.to_id}`,
    from: [flow.from_lat, flow.from_lon] as [number, number],
    to: [flow.to_lat, flow.to_lon] as [number, number],
    laden: true,
    weight: flow.shipments / busiest,
    label: `${flow.from_name} — ${flow.to_name}: ${flow.shipments} отправк${flow.shipments === 1 ? "а" : "и"}, ${flow.tonnes} т`,
  }));

  return (
    <main>
      {/* Hero: the map is the product, so it leads. */}
      <section className="relative min-h-[82vh] overflow-hidden border-b border-ink-800">
        <div className="absolute inset-0 opacity-90">
          <MapPanel settlements={settlements} arcs={arcs} labels />
        </div>
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-ink-950 via-ink-950/85 to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-ink-950 to-transparent" />

        <div className="relative mx-auto flex min-h-[82vh] max-w-7xl flex-col justify-center px-4 py-14">
          <div className="max-w-xl">
            <div className="flex items-center gap-2.5">
              <Logo className="h-7 w-7" />
              <span className="text-caption uppercase text-ink-400">
                Мангистауская область
              </span>
            </div>

            <h1 className="mt-5 text-display text-ink-50">
              Груз есть.
              <br />
              Машина есть.
              <br />
              <span className="text-accent">Рейс собран.</span>
            </h1>

            <p className="mt-5 max-w-lg text-body text-ink-300">
              Биржа сводит одну заявку с одной машиной. Заявка на 400 кг в село за 250 км там
              не получает отклика — отдельный рейс за такой груз убыточен. Мы собираем несколько
              заявок в один рейс: обратную загрузку вместо порожнего пробега и мелкие грузы
              в отдалённые посёлки одним заходом.
            </p>

            <div className="mt-7 flex flex-wrap gap-2.5">
              <LinkButton href="/shipper">Отправить груз</LinkButton>
              <LinkButton href="/driver" variant="secondary">
                Найти рейс
              </LinkButton>
            </div>

            <p className="mt-3.5 text-small text-ink-500">
              Без регистрации. Данные настоящие и сохраняются в базу.
            </p>
          </div>

          {/* The headline claim, on the hero, as one bar. */}
          <Surface className="mt-10 max-w-xl p-4 sm:p-5">
            <div className="flex items-baseline justify-between gap-4">
              <div>
                <div className="text-caption uppercase text-ink-500">
                  Оплачиваемых километров в текущем плане
                </div>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="tnum text-metric-lg text-laden-ink">
                    {percent(stats.paid_km_share)}
                  </span>
                  <span className="text-small text-ink-400">
                    против потолка {percent(stats.paid_km_ceiling_without_pairing)}
                  </span>
                </div>
              </div>
              <Badge tone="laden">{stats.trips} рейсов</Badge>
            </div>
            <div className="mt-3.5">
              <LadenBar ladenKm={stats.planned_km - stats.planned_empty_km} emptyKm={stats.planned_empty_km} />
            </div>
            <p className="mt-3 text-small text-ink-400">
              Машина, которая везёт груз туда и возвращается порожняком, не может превысить 50%.
              Всё, что выше — это собранные рейсы.
            </p>
          </Surface>
        </div>
      </section>

      {/* What the plan already saves */}
      <section className="mx-auto max-w-7xl px-4 py-12">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Surface className="p-5">
            <Metric
              label="Не поехали"
              value={km(stats.km_avoided).replace(" км", "")}
              unit="км"
              sub={`против ${km(stats.today_km)} при порожнем пробеге ${percent(ASSUMPTIONS.regionalEmptyShareToday)}`}
            />
          </Surface>
          <Surface className="p-5">
            <Metric
              label="Топливо"
              value={litres(stats.fuel_saved_l).replace(" л", "")}
              unit="л"
              sub={kzt(stats.money_saved_kzt)}
              tone="laden"
            />
          </Surface>
          <Surface className="p-5">
            <Metric
              label="Заявок обслужено"
              value={stats.orders_covered}
              unit={`из ${stats.orders_total}`}
            />
          </Surface>
          <Surface className="p-5">
            <Metric
              label="Мелких грузов в сёла"
              value={stats.small_remote_served}
              sub="до тонны, дальше 100 км"
              tone="accent"
            />
          </Surface>
        </div>

        <div className="mt-8 grid gap-3 lg:grid-cols-2">
          <Surface className="p-5">
            <h3 className="text-h3 text-ink-50">Настоящее</h3>
            <ul className="mt-3 space-y-2 text-small text-ink-300">
              <Fact>65 населённых пунктов области из OpenStreetMap, с казахскими и русскими названиями</Fact>
              <Fact>2080 расстояний по дорожной сети через OSRM — ни одного по прямой</Fact>
              <Fact>Постоянная база Postgres, свой серверный бэкенд</Fact>
              <Fact>Алгоритм сборки рейсов и расчёт экономики</Fact>
            </ul>
            <p className="mt-3.5 text-small text-ink-500">
              Побочная находка: дороги Мангистау в среднем на 53% длиннее прямой линии —
              измерено по 4158 маршрутам.
            </p>
          </Surface>

          <Surface className="p-5">
            <h3 className="text-h3 text-ink-50">Смоделированное</h3>
            <ul className="mt-3 space-y-2 text-small text-ink-300">
              <Fact tone="muted">Кто именно что везёт — реальных отправителей у проекта нет</Fact>
              <Fact tone="muted">Парк машин и их текущее положение</Fact>
              <Fact tone="muted">Движение по маршруту — симуляция, не GPS-трекеры</Fact>
            </ul>
            <p className="mt-3.5 text-small text-ink-500">
              Спрос сгенерирован от населения и типа пункта, а не случайно: города отправляют,
              отдалённые села получают, часть сёл отправляет обратно.
            </p>
            <Link
              href="/methodology"
              className="mt-3.5 inline-block text-small font-medium text-accent underline decoration-accent-dim underline-offset-4 hover:text-accent-hover"
            >
              Как считается каждая цифра
            </Link>
          </Surface>
        </div>
      </section>
    </main>
  );
}

function Fact({ children, tone = "accent" }: { children: React.ReactNode; tone?: "accent" | "muted" }) {
  return (
    <li className="flex gap-2.5">
      <span
        className={`mt-[0.45rem] h-1.5 w-1.5 shrink-0 rounded-full ${
          tone === "accent" ? "bg-accent" : "bg-ink-600"
        }`}
      />
      <span>{children}</span>
    </li>
  );
}
