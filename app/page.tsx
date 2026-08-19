import Link from "next/link";

import { Badge, LinkButton, Logo, Surface } from "@/components/ui";
import { indicativePriceKzt } from "@/lib/engine/economics";
import { km, kzt, litres, percent, weight } from "@/lib/format";
import { analytics, listTrips } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [stats, proposed] = await Promise.all([analytics(), listTrips("proposed")]);

  // A real trip from the database, used as the hero example. Nothing here is a
  // mock-up: if the engine found nothing, the card simply does not appear.
  const example =
    [...proposed].sort((a, b) => b.stops.length - a.stops.length)[0] ?? null;

  return (
    <main className="min-h-screen">
      <header className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
        <div className="flex items-center gap-2.5">
          <Logo className="h-7 w-7" />
          <span className="text-[0.9375rem] font-semibold tracking-tight text-ink-900">
            Mangystau<span className="text-brand">.</span>
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <Link
            href="/demo"
            className="rounded-control px-3 py-1.5 text-small font-medium text-brand transition hover:bg-brand-soft"
          >
            Показать за минуту
          </Link>
          <Link
            href="/methodology"
            className="rounded-control px-3 py-1.5 text-small text-ink-500 transition hover:bg-ink-100 hover:text-ink-700"
          >
            Как это считается
          </Link>
        </div>
      </header>

      {/* Hero: copy on the left, a real trip from the system on the right. */}
      <section className="mx-auto grid max-w-6xl items-center gap-10 px-5 pb-16 pt-8 lg:grid-cols-2 lg:gap-14 lg:pt-16">
        <div>
          <Badge tone="accent">Мангистауская область</Badge>

          <h1 className="mt-5 text-display text-ink-900">
            Отвезти груз по области —
            <br />
            <span className="text-brand">без звонков и поисков</span>
          </h1>

          <p className="mt-5 max-w-md text-[1.0625rem] leading-relaxed text-ink-400">
            Напишите, что и куда везти. Мы найдём машину, которая уже едет в ту сторону,
            и добавим ваш груз к её рейсу. Дешевле, чем гнать машину отдельно.
          </p>

          <div className="mt-8 flex flex-col gap-2.5 sm:flex-row">
            <LinkButton href="/shipper">Отправить груз</LinkButton>
            <LinkButton href="/driver" variant="secondary">
              Я перевозчик
            </LinkButton>
          </div>

          <p className="mt-4 text-small text-ink-500">Без регистрации — просто выберите роль</p>
        </div>

        {example ? <HeroExample trip={example} /> : null}
      </section>

      {/* How it works — three steps, plain words. */}
      <section className="border-y border-ink-200 bg-ink-50 py-14">
        <div className="mx-auto max-w-6xl px-5">
          <h2 className="text-h1 text-ink-900">Как это работает</h2>
          <div className="mt-8 grid gap-8 sm:grid-cols-3">
            <Step
              n="1"
              title="Пишете как в мессенджере"
              text="«3 тонны арматуры из Актау в Жанаозен завтра до обеда». Никаких полей и форм."
            />
            <Step
              n="2"
              title="Мы собираем рейс"
              text="Ищем машину, которая уже идёт в ту сторону, и подбираем ей попутные грузы."
            />
            <Step
              n="3"
              title="Водитель берёт и едет"
              text="Вы видите, кто везёт и где груз. Он видит маршрут и заработок."
            />
          </div>
        </div>
      </section>

      {/* The differentiator, shown rather than argued. */}
      <section className="mx-auto max-w-6xl px-5 py-14">
        <h2 className="text-h1 text-ink-900">Почему дешевле</h2>
        <p className="mt-3 max-w-2xl text-body text-ink-400">
          Отдельная машина за 400 кг в село — это невыгодно, поэтому такие заявки обычно
          вообще никто не берёт. Мы складываем несколько мелких грузов в один рейс.
        </p>

        <div className="mt-8 grid items-center gap-6 lg:grid-cols-[1fr_auto_1fr]">
          <Surface className="p-5">
            <div className="text-caption uppercase text-empty-ink">Отдельными рейсами</div>
            <ul className="mt-3 space-y-2.5">
              {[
                ["400 кг", "в Сенек"],
                ["700 кг", "в Курык"],
                ["300 кг", "в Жетыбай"],
              ].map(([mass, place]) => (
                <li key={place} className="flex items-center gap-3 text-small">
                  <span className="flex h-7 w-7 items-center justify-center rounded-control bg-ink-100 text-[0.625rem] text-ink-500">
                    🚛
                  </span>
                  <span className="tnum text-ink-700">{mass}</span>
                  <span className="text-ink-500">{place}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3.5 text-small text-empty-ink">
              Три машины. Или, что бывает чаще, ни одной — никто не поедет.
            </p>
          </Surface>

          <div className="flex justify-center text-2xl text-brand lg:rotate-0">→</div>

          <Surface accent className="p-5">
            <div className="text-caption uppercase text-laden-ink">Один рейс</div>
            <div className="mt-3 flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-control bg-brand-soft text-base">
                🚛
              </span>
              <div>
                <div className="tnum text-body font-semibold text-ink-900">1400 кг</div>
                <div className="text-small text-ink-500">Сенек · Курык · Жетыбай</div>
              </div>
            </div>
            <p className="mt-3.5 text-small text-laden-ink">
              Одна машина вместо трёх. Все три магазина получили товар.
            </p>
          </Surface>
        </div>
      </section>

      {/* Numbers, each with a plain reason for being here. */}
      <section className="border-t border-ink-200 bg-ink-50 py-14">
        <div className="mx-auto max-w-6xl px-5">
          <h2 className="text-h1 text-ink-900">Что это даёт</h2>
          <p className="mt-3 max-w-2xl text-body text-ink-400">
            Цифры ниже посчитаны на текущем плане перевозок в системе — по настоящим дорожным
            расстояниям Мангистау.
          </p>

          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Outcome
              who="Перевозчику"
              value={percent(stats.paid_km_share)}
              caption="километров с грузом"
              why={`Машина, которая едет туда с грузом и обратно порожняком, зарабатывает максимум на ${percent(stats.paid_km_ceiling_without_pairing)} пути. Собранный рейс — на ${percent(stats.paid_km_share)}.`}
              tone="laden"
            />
            <Outcome
              who="Отправителю"
              value={String(stats.small_remote_served)}
              caption="мелких грузов доставлено в села"
              why="Грузы до тонны дальше 100 км — те самые, которые обычно висят без ответа, потому что отдельный рейс за них невыгоден."
              tone="accent"
            />
            <Outcome
              who="Области"
              value={km(stats.km_avoided)}
              caption="машины не проехали"
              why={`Тот же груз перевезён меньшим пробегом: ${litres(stats.fuel_saved_l)} топлива и ${kzt(stats.money_saved_kzt)} экономии, плюс меньше износа дорог.`}
              tone="neutral"
            />
          </div>

          <Link
            href="/methodology"
            className="mt-6 inline-block text-small font-medium text-brand underline decoration-brand-border underline-offset-4 hover:text-brand-hover"
          >
            Откуда эти цифры и что здесь смоделировано
          </Link>
        </div>
      </section>

      {/* Roles — who opens which screen. */}
      <section className="mx-auto max-w-6xl px-5 py-14">
        <h2 className="text-h1 text-ink-900">Кому это нужно</h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          <RoleCard
            href="/shipper"
            title="Отправитель"
            who="Магазин, стройка, фермерское хозяйство"
            does="Написать заявку и видеть, где груз"
          />
          <RoleCard
            href="/driver"
            title="Перевозчик"
            who="Водитель, владелец машины"
            does="Взять рейс и не ехать порожняком"
          />
          <RoleCard
            href="/akimat"
            title="Акимат"
            who="Отдел транспорта и снабжения"
            does="Видеть, куда и сколько возят в области"
          />
        </div>
      </section>

      <footer className="border-t border-ink-200 py-8">
        <div className="mx-auto max-w-6xl px-5 text-small text-ink-500">
          Данные о населённых пунктах и дорогах — OpenStreetMap и OSRM. Хакатон Mangystau, 2026.
        </div>
      </footer>
    </main>
  );
}

/** A real proposed trip, presented as the product's own artefact. */
function HeroExample({ trip }: { trip: Awaited<ReturnType<typeof listTrips>>[number] }) {
  const orders = new Set(trip.stops.map((stop) => stop.order_id).filter(Boolean)).size;
  const cargo = trip.stops
    .filter((stop) => stop.action === "pickup" && stop.cargo)
    .slice(0, 3)
    .map((stop) => `${stop.cargo}${stop.weight_kg ? ` ${weight(stop.weight_kg)}` : ""}`);

  return (
    <div className="relative">
      <div className="absolute -inset-6 rounded-[28px] bg-brand/[0.06] blur-2xl" aria-hidden />
      <Surface accent className="relative overflow-hidden">
        <div className="flex items-center justify-between border-b border-ink-200 px-4 py-3">
          <span className="text-caption uppercase text-ink-500">Сейчас в системе</span>
          <Badge tone="laden">рейс собран</Badge>
        </div>

        <div className="p-4 sm:p-5">
          <div className="text-h3 text-ink-900">
            {trip.at_name} → {trip.stops[Math.floor(trip.stops.length / 2)]?.settlement_name} →{" "}
            {trip.at_name}
          </div>
          <div className="mt-1 text-small text-ink-500">
            {trip.plate} · {trip.capacity_kg / 1000} т · {orders} груза в одном рейсе
          </div>

          <ul className="mt-4 space-y-1.5">
            {cargo.map((line, index) => (
              <li key={index} className="flex items-center gap-2.5 text-small text-ink-400">
                <span className="h-1.5 w-1.5 rounded-full bg-brand" />
                {line}
              </li>
            ))}
          </ul>

          <div className="mt-5 grid grid-cols-3 gap-3 border-t border-ink-200 pt-4">
            <div>
              <div className="text-caption uppercase text-ink-500">Водитель получит</div>
              <div className="tnum mt-1 text-metric text-brand">
                {kzt(indicativePriceKzt(trip.fuel_l))}
              </div>
            </div>
            <div>
              <div className="text-caption uppercase text-ink-500">Порожний</div>
              <div className="tnum mt-1 text-metric text-laden-ink">{km(trip.empty_km)}</div>
            </div>
            <div>
              <div className="text-caption uppercase text-ink-500">Всего</div>
              <div className="tnum mt-1 text-metric text-ink-900">{km(trip.total_km)}</div>
            </div>
          </div>
        </div>
      </Surface>
    </div>
  );
}

function Step({ n, title, text }: { n: string; title: string; text: string }) {
  return (
    <div>
      <div className="flex h-9 w-9 items-center justify-center rounded-full border border-brand-border/60 bg-brand-soft text-body font-semibold text-brand">
        {n}
      </div>
      <h3 className="mt-3.5 text-h3 text-ink-900">{title}</h3>
      <p className="mt-1.5 text-small text-ink-400">{text}</p>
    </div>
  );
}

function Outcome({
  who,
  value,
  caption,
  why,
  tone,
}: {
  who: string;
  value: string;
  caption: string;
  why: string;
  tone: "laden" | "accent" | "neutral";
}) {
  const color = { laden: "text-laden-ink", accent: "text-brand", neutral: "text-ink-900" }[tone];
  return (
    <Surface className="p-5">
      <div className="text-caption uppercase text-ink-500">{who}</div>
      <div className={`tnum mt-2 text-metric-lg ${color}`}>{value}</div>
      <div className="text-small text-ink-700">{caption}</div>
      <p className="mt-3 text-small text-ink-500">{why}</p>
    </Surface>
  );
}

function RoleCard({
  href,
  title,
  who,
  does,
}: {
  href: string;
  title: string;
  who: string;
  does: string;
}) {
  return (
    <Link href={href} className="block">
      <Surface interactive className="h-full p-5">
        <div className="text-h3 text-ink-900">{title}</div>
        <div className="mt-1 text-caption uppercase text-ink-500">{who}</div>
        <p className="mt-3 text-small text-ink-400">{does}</p>
        <span className="mt-4 inline-block text-small font-medium text-brand">Открыть →</span>
      </Surface>
    </Link>
  );
}
