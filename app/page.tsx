import Link from "next/link";

import { analytics } from "@/lib/queries";
import { ASSUMPTIONS } from "@/lib/engine/economics";
import { km, kzt, litres, percent } from "@/lib/format";

export const dynamic = "force-dynamic";

const ROLES = [
  {
    href: "/shipper",
    title: "Отправитель",
    line: "Написать заявку обычным сообщением и следить за грузом",
    who: "магазин, стройка, фермерское хозяйство",
  },
  {
    href: "/driver",
    title: "Перевозчик",
    line: "Взять рейс, собранный из нескольких грузов, и не ехать порожняком",
    who: "водитель, владелец машины",
  },
  {
    href: "/akimat",
    title: "Акимат",
    line: "Видеть грузопоток области и где машины ходят пустыми",
    who: "планирование дорог и снабжения",
  },
] as const;

export default async function HomePage() {
  const stats = await analytics();

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <p className="text-sm font-medium uppercase tracking-wider text-caspian-600">
        Мангистауская область
      </p>
      <h1 className="mt-2 text-3xl font-semibold leading-tight text-sand-900 sm:text-4xl">
        Диспетчер грузоперевозок,
        <br />
        а не доска объявлений
      </h1>
      <p className="mt-4 max-w-2xl text-sand-700">
        Биржа сводит одну заявку с одной машиной. Заявка на 400 кг в село за 250 км на бирже
        не получает отклика — отдельный рейс за такой груз убыточен. Мы собираем несколько
        заявок в <strong className="font-semibold">один рейс</strong>: обратную загрузку вместо
        порожнего пробега и мелкие грузы в отдалённые посёлки одним заходом.
      </p>

      <div className="mt-8 grid gap-3 sm:grid-cols-3">
        {ROLES.map((role) => (
          <Link
            key={role.href}
            href={role.href}
            className="group rounded-xl border border-sand-200 bg-white p-5 shadow-sm transition hover:border-caspian-400 hover:shadow"
          >
            <div className="text-lg font-semibold text-sand-900 group-hover:text-caspian-700">
              {role.title}
            </div>
            <div className="mt-1 text-xs uppercase tracking-wide text-sand-500">{role.who}</div>
            <p className="mt-2 text-sm text-sand-700">{role.line}</p>
            <span className="mt-3 inline-block text-sm font-medium text-caspian-600">Войти →</span>
          </Link>
        ))}
      </div>
      <p className="mt-3 text-xs text-sand-500">
        Регистрации нет: выберите роль и работайте. Данные при этом настоящие и сохраняются в базу.
      </p>

      <section className="mt-12 rounded-xl border border-sand-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-sand-900">Что уже посчитано на текущем плане</h2>
        <div className="mt-4 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <div className="text-xs uppercase tracking-wide text-sand-500">Оплачиваемых километров</div>
            <div className="mt-1 text-3xl font-semibold tabular-nums text-laden">
              {percent(stats.paid_km_share)}
            </div>
            <div className="mt-1 text-xs text-sand-600">
              потолок схемы «туда с грузом, обратно порожняком» —{" "}
              {percent(stats.paid_km_ceiling_without_pairing)}
            </div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-sand-500">Не поехали</div>
            <div className="mt-1 text-3xl font-semibold tabular-nums text-sand-900">
              {km(stats.km_avoided)}
            </div>
            <div className="mt-1 text-xs text-sand-600">
              против {km(stats.today_km)} при порожнем пробеге {percent(ASSUMPTIONS.regionalEmptyShareToday)}
            </div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-sand-500">Топливо</div>
            <div className="mt-1 text-3xl font-semibold tabular-nums text-sand-900">
              {litres(stats.fuel_saved_l)}
            </div>
            <div className="mt-1 text-xs text-sand-600">{kzt(stats.money_saved_kzt)}</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-sand-500">Мелкие грузы в сёла</div>
            <div className="mt-1 text-3xl font-semibold tabular-nums text-sand-900">
              {stats.small_remote_served}
            </div>
            <div className="mt-1 text-xs text-sand-600">
              до тонны, дальше 100 км — обслужены
            </div>
          </div>
        </div>
        <p className="mt-5 text-xs text-sand-600">
          {stats.trips} рейсов, {stats.orders_covered} из {stats.orders_total} заявок.{" "}
          <Link href="/methodology" className="font-medium text-caspian-700 underline">
            Как это считается и что здесь смоделировано
          </Link>
        </p>
      </section>

      <section className="mt-6 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-sand-200 bg-white p-5">
          <h3 className="font-semibold text-sand-900">Настоящее</h3>
          <ul className="mt-2 space-y-1 text-sm text-sand-700">
            <li>65 населённых пунктов области из OpenStreetMap</li>
            <li>2080 расстояний по дорожной сети, ни одного по прямой</li>
            <li>Постоянная база данных, свой сервер</li>
            <li>Алгоритм сборки рейсов и расчёт экономики</li>
          </ul>
        </div>
        <div className="rounded-xl border border-sand-200 bg-white p-5">
          <h3 className="font-semibold text-sand-900">Смоделированное</h3>
          <ul className="mt-2 space-y-1 text-sm text-sand-700">
            <li>Кто именно что везёт — реальных отправителей у нас нет</li>
            <li>Парк машин и их текущее положение</li>
            <li>Движение по маршруту — симуляция, не GPS-трекеры</li>
          </ul>
          <p className="mt-2 text-xs text-sand-600">
            Спрос сгенерирован от населения и типа пункта, а не случайно.
          </p>
        </div>
      </section>
    </main>
  );
}
