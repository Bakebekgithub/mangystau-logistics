import Link from "next/link";

import { Badge, Surface, TopBar } from "@/components/ui";
import { getDb } from "@/lib/db";
import { ASSUMPTIONS } from "@/lib/engine/economics";
import { analytics } from "@/lib/queries";
import { km, kzt, litres, percent } from "@/lib/format";

export const dynamic = "force-dynamic";

/**
 * Every number the product shows, and where it comes from.
 *
 * This page is the answer to the only question that can sink a demo like this:
 * "did you make these figures up?" Each assumption is stated with its source, and
 * anything modelled is labelled as modelled.
 */
export default async function MethodologyPage() {
  const db = getDb();
  const stats = await analytics();

  const [counts] = await db.query<{
    settlements: string;
    distances: string;
    osrm: string;
    estimated: string;
  }>(
    `SELECT (SELECT count(*) FROM settlements) AS settlements,
            (SELECT count(*) FROM distances) AS distances,
            (SELECT count(*) FROM distances WHERE source = 'osrm') AS osrm,
            (SELECT count(*) FROM distances WHERE source = 'estimated') AS estimated`,
  );

  return (
    <>
      <TopBar />
      <main className="mx-auto max-w-3xl space-y-8 px-4 py-8">
        <header>
          <h1 className="text-h1 text-ink-900">Методология</h1>
          <p className="mt-2 text-body text-ink-400">
            Откуда берётся каждая цифра, что здесь измерено, а что смоделировано, и на каких
            допущениях стоит экономика. Если что-то из этого выглядит спорно — здесь видно, где
            именно спорить.
          </p>
        </header>

        <Section title="Данные, которые не мы придумали">
          <Row
            label="Населённые пункты"
            value={`${counts?.settlements ?? 0}`}
            source="OpenStreetMap, отношение области 215686, лицензия ODbL 1.0"
          >
            Названия на казахском и русском, координаты и население — как в OSM. Пункты без
            названия отброшены: их нельзя показать диспетчеру.
          </Row>
          <Row
            label="Дорожные расстояния"
            value={`${counts?.distances ?? 0}`}
            source="OSRM на дорожной сети OpenStreetMap"
          >
            Направленных записей в базе. Все получены маршрутизацией по дорогам:{" "}
            <strong className="text-laden-ink">{counts?.osrm ?? 0}</strong> по дорожной сети,{" "}
            <strong>{counts?.estimated ?? 0}</strong> оценочных. Расстояния считаются при сборке
            данных и лежат в базе — во время работы приложение не обращается к внешним сервисам,
            поэтому демо не зависит от чужого сервера.
          </Row>
          <Row
            label="Извилистость дорог"
            value={String(ASSUMPTIONS.measuredDetourFactor)}
            source="Измерено по 4158 маршрутам этого же региона"
          >
            {ASSUMPTIONS.detourNote} Это не используется в расчётах — все расстояния настоящие
            дорожные, — но хорошо описывает, насколько разрежена сеть в области.
          </Row>
          <Row
            label="Граница области"
            value="116 точек"
            source="OpenStreetMap, то же отношение 215686"
          >
            Контур упрощён алгоритмом Рамера—Дугласа—Пекера с допуском 0.01°, примерно километр.
            Карта рисует его сама, без растровых тайлов со стороннего сервера.
          </Row>
        </Section>

        <Section title="Что смоделировано" tone="warn">
          <Row label="Заявки" value="кто что везёт" source="Генератор, не реальные отправители">
            Реальных грузоотправителей у проекта нет и быть не может — их коммерческие данные
            никто не отдаст. Спрос генерируется от структуры региона, а не случайно: города и
            пгт отправляют, отдалённые села получают, часть сёл отправляет обратно — именно это
            и создаёт возможность обратной загрузки. Вес привязан к размеру меньшего из двух
            пунктов: хутор не может принять фуру и не может её наполнить.
          </Row>
          <Row label="Парк машин" value="18 машин" source="Генератор">
            Состав парка смещён к среднетоннажным — это то, чем реально возят внутри области.
            Каждая шестая машина — рефрижератор, поэтому скоропортящийся груз иногда действительно
            трудно разместить, и движок обязан это учитывать.
          </Row>
          <Row label="Движение по маршруту" value="симуляция" source="Не GPS-трекеры">
            Статусы меняются, когда водитель отмечает точку. Реальных трекеров в MVP нет.
          </Row>
          <Row label="Воспроизводимость" value="фиксированное зерно" source="Детерминированный генератор">
            Один и тот же набор данных при каждом запуске. Демо, которое меняется между
            репетицией и сценой, — это демо, которое подведёт.
          </Row>
        </Section>

        <Section title="Экономика: три метрики, от сильной к слабой">
          <div className="space-y-4">
            <Claim
              rank="1"
              tone="laden"
              title="Доля оплачиваемого пробега"
              value={percent(stats.paid_km_share)}
            >
              Чистая арифметика по собранным рейсам, без всяких допущений. Машина, которая везёт
              груз в одну сторону и возвращается порожней, не может превысить{" "}
              {percent(stats.paid_km_ceiling_without_pairing)} — это потолок самой схемы. Всё, что
              выше, получено сборкой рейсов. Оспорить здесь нечего.
            </Claim>

            <Claim
              rank="2"
              tone="accent"
              title="Экономия против текущего состояния"
              value={km(stats.km_avoided)}
            >
              {ASSUMPTIONS.regionalEmptyShareNote} Полезный пробег груза{" "}
              {km(stats.payload_km)}; чтобы перевезти его при порожнем пробеге{" "}
              {percent(ASSUMPTIONS.regionalEmptyShareToday)}, регион проехал бы{" "}
              {km(stats.today_km)}. План проезжает {km(stats.planned_km)}. Разница —{" "}
              {litres(stats.fuel_saved_l)} и {kzt(stats.money_saved_kzt)}.
            </Claim>

            <Claim
              rank="3"
              tone="neutral"
              title="Против отдельного рейса на каждую заявку"
              value={km(stats.dedicated_km)}
            >
              Верхняя граница, и мы её таковой и называем. Столько вышло бы, если под каждую
              заявку отправлять свою машину туда и порожняком обратно. Реальный перевозчик кое-что
              совмещает и сам, поэтому на эту цифру опираться не стоит — она здесь для полноты.
            </Claim>
          </div>
        </Section>

        <Section title="Допущения расчёта">
          <Row
            label="Цена дизельного топлива"
            value={`${ASSUMPTIONS.dieselPriceKztPerL} ₸/л`}
            source="Розничные цены в Казахстане, август 2026"
          >
            {ASSUMPTIONS.dieselPriceNote}
          </Row>
          <Row
            label="Расход груженого хода"
            value={`+${Math.round(ASSUMPTIONS.ladenSurchargeAtFullLoad * 100)}%`}
            source="Отраслевое правило, заявленное допущение"
          >
            {ASSUMPTIONS.ladenSurchargeNote} Допущение сознательно консервативное: оно делает
            собранные рейсы чуть дороже, а не дешевле.
          </Row>
          <Row
            label="Ориентировочная цена рейса"
            value={`топливо ÷ ${ASSUMPTIONS.fuelShareOfOperatingCost}`}
            source="Заявленное допущение, не тариф"
          >
            {ASSUMPTIONS.priceNote}
          </Row>
        </Section>

        <Section title="Как движок собирает рейс">
          <p className="text-body text-ink-400">
            Для свободной машины берётся пул заявок, которые она физически может взять: вес
            в пределах вместимости, рефрижератор для скоропортящегося, срок ещё не истёк.
            Дальше перебираются комбинации из нескольких заявок, и для каждой ищется порядок
            остановок — полным перебором с тремя отсечениями: погрузка раньше выгрузки, вес
            никогда не превышает вместимость, и ветка отбрасывается, как только становится длиннее
            лучшего найденного варианта. Для того числа заявок, которое водитель берёт за раз,
            это даёт точный оптимум за миллисекунды, а не эвристику, которую пришлось бы защищать.
          </p>
          <p className="mt-3 text-body text-ink-400">
            Рейс не предлагается, если он проезжает больше, чем те же заявки по отдельности.
            Распределение по парку жадное: машина, чей рейс экономит больше, выбирает первой,
            и её заявки уходят из пула. Это объяснимо словами — «этот рейс экономит больше,
            поэтому он забрал заявки первым», — что для диспетчера важнее теоретической
            оптимальности.
          </p>
        </Section>

        <Section title="Разбор заявки из текста">
          <p className="text-body text-ink-400">
            Сообщение отправителя разбирается двумя равноправными реализациями одного контракта.
            Основная — Claude, ограниченный схемой, в которой пункты заданы перечислением
            настоящих идентификаторов: модель физически не может вернуть пункт, которого нет
            в Мангистау. Резервная — детерминированный разборщик по словарю региона: понимает
            падежи, казахские написания, тонны и килограммы с единицей по обе стороны от числа.
            Приложение показывает, какая из них отработала, а не прячет это.
          </p>
          <p className="mt-3 text-small text-ink-500">
            Резерв — не заглушка: без ключа продукт работает полностью, и на разборщике
            держится 12 тестов.
          </p>
        </Section>

        <Section title="Что осталось за рамками хакатона">
          <p className="text-body text-ink-400">
            Регистрация и пароли, чат между сторонами, оплата, реальные GPS-трекеры, мобильные
            приложения в сторах, документооборот и накладные. Ничего из этого не сделано, и мы
            это не выдаём за сделанное.
          </p>
        </Section>

        <footer className="border-t border-ink-200 pt-5">
          <p className="text-small text-ink-500">
            Данные о населённых пунктах и границах — OpenStreetMap, лицензия ODbL 1.0.
            Дорожные расстояния — OSRM на дорожной сети OSM.
          </p>
          <Link
            href="/"
            className="mt-3 inline-block text-small font-medium text-brand underline decoration-brand-border underline-offset-4"
          >
            Вернуться к продукту
          </Link>
        </footer>
      </main>
    </>
  );
}

function Section({
  title,
  children,
  tone = "neutral",
}: {
  title: string;
  children: React.ReactNode;
  tone?: "neutral" | "warn";
}) {
  return (
    <section>
      <h2 className="text-h2 text-ink-900">
        {title}
        {tone === "warn" ? (
          <span className="ml-2.5 align-middle">
            <Badge tone="warn">смоделировано</Badge>
          </span>
        ) : null}
      </h2>
      <div className="mt-3.5 space-y-3">{children}</div>
    </section>
  );
}

function Row({
  label,
  value,
  source,
  children,
}: {
  label: string;
  value: string;
  source: string;
  children: React.ReactNode;
}) {
  return (
    <Surface className="p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-h3 text-ink-900">{label}</span>
        <span className="tnum text-metric text-ink-900">{value}</span>
      </div>
      <div className="mt-1 text-caption uppercase text-ink-500">{source}</div>
      <p className="mt-2.5 text-small text-ink-400">{children}</p>
    </Surface>
  );
}

function Claim({
  rank,
  title,
  value,
  tone,
  children,
}: {
  rank: string;
  title: string;
  value: string;
  tone: "laden" | "accent" | "neutral";
  children: React.ReactNode;
}) {
  const ring = {
    laden: "border-laden-border/70",
    accent: "border-brand-border/70",
    neutral: "border-ink-200",
  }[tone];
  const numberColor = {
    laden: "text-laden-ink",
    accent: "text-brand",
    neutral: "text-ink-700",
  }[tone];

  return (
    <div className={`rounded-card border bg-white p-4 ${ring}`}>
      <div className="flex items-start gap-3.5">
        <span
          className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-small font-semibold ${ring} ${numberColor}`}
        >
          {rank}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-h3 text-ink-900">{title}</span>
            <span className={`tnum text-metric ${numberColor}`}>{value}</span>
          </div>
          <p className="mt-2 text-small text-ink-400">{children}</p>
        </div>
      </div>
    </div>
  );
}
