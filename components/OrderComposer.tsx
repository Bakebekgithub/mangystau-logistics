"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { Alert, Badge, Surface, buttonClass } from "./ui";
import type { ParsedOrder } from "@/lib/ai/parse-order";
import { ASSUMPTIONS } from "@/lib/engine/economics";
import { kzt, weight, when } from "@/lib/format";

interface SettlementOption {
  id: string;
  name_ru: string;
  name_kz: string;
}

const EXAMPLES = [
  { short: "Арматура", text: "надо 3 тонны арматуры из Актау в Жанаозен завтра до обеда" },
  {
    short: "Мелкий груз в село",
    text: "Магазину в Сенеке нужно завезти продуктов, кило 400. Забрать с базы в Актау",
  },
  { short: "Рыба, срочно", text: "рыбу свежую 800 кг с Форт-Шевченко надо в Актау, срочно" },
];

/**
 * The shipper writes a message; the product shows what it understood and lets
 * every field be corrected before anything is saved.
 *
 * Planning is kicked off without waiting for it: a full fleet plan takes several
 * seconds, and the person who just placed an order should not sit through that.
 * The carrier screen shows the order as awaiting a truck in the meantime.
 */
export function OrderComposer({ settlements }: { settlements: SettlementOption[] }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [draft, setDraft] = useState<ParsedOrder | null>(null);
  const [shipper, setShipper] = useState("");
  const [phone, setPhone] = useState("");
  const [price, setPrice] = useState("");
  const [floor, setFloor] = useState<PriceFloor | null>(null);
  const [phase, setPhase] = useState<"idle" | "parsing" | "saving" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  const origin = draft?.origin_id ?? null;
  const destination = draft?.destination_id ?? null;
  const weightKg = draft?.weight_kg ?? null;

  useEffect(() => {
    if (!origin || !destination || !weightKg) {
      setFloor(null);
      return;
    }
    const controller = new AbortController();
    const query = `origin=${origin}&destination=${destination}&weight=${weightKg}`;
    fetch(`/api/price?${query}`, { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => setFloor(data))
      .catch(() => {
        /* Aborted or offline: the field simply shows no recommendation. */
      });
    return () => controller.abort();
  }, [origin, destination, weightKg]);

  async function parse() {
    setPhase("parsing");
    setError(null);
    try {
      const response = await fetch("/api/orders/parse", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Не удалось разобрать сообщение");
      setDraft(data as ParsedOrder);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setPhase("idle");
    }
  }

  async function place() {
    if (!draft) return;
    setPhase("saving");
    setError(null);
    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...draft,
          shipper_name: shipper || "Отправитель",
          shipper_phone: phone.trim() || null,
          offered_price_kzt: Number(price.replace(/\s/g, "")) || null,
          raw_text: text,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Не удалось разместить заявку");

      // Fire and forget: the driver screen will pick the new trips up.
      void fetch("/api/plan", { method: "POST" });

      setText("");
      setDraft(null);
      setPhone("");
      setPrice("");
      setPhase("done");
      router.refresh();
      setTimeout(() => setPhase("idle"), 4000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
      setPhase("idle");
    }
  }

  const complete = Boolean(draft?.origin_id && draft?.destination_id && draft?.cargo && draft?.weight_kg);

  return (
    <Surface className="overflow-hidden">
      <div className="border-b border-ink-200 px-4 py-3.5 sm:px-5">
        <h2 className="text-h3 text-ink-900">Новая заявка</h2>
        <p className="mt-0.5 text-small text-ink-500">
          Напишите своими словами — как в мессенджере. Поля заполнять не нужно.
        </p>
      </div>

      <div className="p-4 sm:p-5">
        <div className="relative">
          <textarea
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              setDraft(null);
            }}
            rows={3}
            placeholder="надо 3 тонны арматуры из Актау в Жанаозен завтра до обеда"
            className="w-full resize-y rounded-control border border-ink-300 bg-white p-3.5 text-body text-ink-900 placeholder:text-ink-600 transition focus:border-brand-border focus:outline-none"
          />
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            onClick={parse}
            disabled={phase !== "idle" || text.trim().length === 0}
            className={buttonClass("primary", "md")}
          >
            {phase === "parsing" ? "Разбираю…" : "Разобрать"}
          </button>
          <span className="text-small text-ink-600">примеры:</span>
          {EXAMPLES.map((example) => (
            <button
              key={example.short}
              onClick={() => {
                setText(example.text);
                setDraft(null);
              }}
              className="rounded-pill border border-ink-200 px-2.5 py-1 text-[0.6875rem] text-ink-600 transition hover:border-ink-400 hover:text-ink-900"
            >
              {example.short}
            </button>
          ))}
        </div>

        {phase === "done" ? (
          <div className="mt-3">
            <Alert tone="accent">
              Заявка размещена. Движок подбирает машину — откройте вкладку «Перевозчик».
            </Alert>
          </div>
        ) : null}

        {error ? (
          <div className="mt-3">
            <Alert tone="danger">{error}</Alert>
          </div>
        ) : null}

        {draft ? (
          <div className="mt-4 animate-rise rounded-control border border-ink-200 bg-ink-50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-caption uppercase text-ink-500">Мы поняли так</span>
              <Badge tone={draft.parsed_by === "ai" ? "accent" : "neutral"}>
                {draft.parsed_by === "ai" ? "разобрано ИИ" : "разобрано по словарю региона"}
              </Badge>
            </div>

            <div className="mt-3.5 grid gap-3 sm:grid-cols-2">
              <Field label="Откуда">
                <Select
                  value={draft.origin_id ?? ""}
                  onChange={(value) => setDraft({ ...draft, origin_id: value || null })}
                  settlements={settlements}
                />
              </Field>
              <Field label="Куда">
                <Select
                  value={draft.destination_id ?? ""}
                  onChange={(value) => setDraft({ ...draft, destination_id: value || null })}
                  settlements={settlements}
                />
              </Field>
              <Field label="Груз">
                <input
                  value={draft.cargo ?? ""}
                  onChange={(event) => setDraft({ ...draft, cargo: event.target.value })}
                  placeholder="арматура"
                  className={INPUT}
                />
              </Field>
              <Field label={`Вес${draft.weight_kg ? `, ${weight(draft.weight_kg)}` : ""}`}>
                <input
                  type="number"
                  min={1}
                  value={draft.weight_kg ?? ""}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      weight_kg: event.target.value ? Number(event.target.value) : null,
                    })
                  }
                  placeholder="кг"
                  className={`${INPUT} tnum`}
                />
              </Field>
            </div>

            <div className="mt-3.5 flex flex-wrap items-center gap-x-5 gap-y-2 text-small text-ink-500">
              <span>Готов: {draft.ready_at ? when(draft.ready_at) : "—"}</span>
              <span>Срок: {draft.deadline_at ? when(draft.deadline_at) : "—"}</span>
              <label className="flex cursor-pointer items-center gap-2 text-ink-600">
                <input
                  type="checkbox"
                  checked={draft.needs_cooling}
                  onChange={(event) => setDraft({ ...draft, needs_cooling: event.target.checked })}
                  className="h-3.5 w-3.5 accent-[#2563EB]"
                />
                Нужен рефрижератор
              </label>
            </div>

            {draft.warnings.length > 0 ? (
              <ul className="mt-3 space-y-1">
                {draft.warnings.map((warning) => (
                  <li key={warning} className="text-small text-warn">
                    {warning}
                  </li>
                ))}
              </ul>
            ) : null}

            <div className="mt-3.5 rounded-control border border-brand-border/60 bg-brand-soft p-3.5">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <label className="min-w-0 flex-1">
                  <span className="text-caption uppercase text-brand">Сколько вы платите</span>
                  <span className="mt-1.5 flex items-center gap-2">
                    <input
                      type="text"
                      inputMode="numeric"
                      value={price}
                      onChange={(event) => setPrice(event.target.value.replace(/[^\d\s]/g, ""))}
                      placeholder={floor ? String(floor.price_kzt) : "20000"}
                      className={`${INPUT} tnum max-w-[11rem] text-[1.0625rem] font-semibold`}
                    />
                    <span className="text-body text-ink-600">₸</span>
                    {floor ? (
                      <button
                        onClick={() => setPrice(String(floor.price_kzt))}
                        className="rounded-pill border border-brand-border bg-white px-2.5 py-1 text-[0.6875rem] font-medium text-brand transition hover:bg-brand-soft"
                      >
                        поставить {kzt(floor.price_kzt)}
                      </button>
                    ) : null}
                  </span>
                </label>
              </div>

              {floor ? (
                <p className="mt-2.5 text-small text-ink-600">
                  Рекомендуем от <span className="tnum font-semibold text-ink-900">{kzt(floor.price_kzt)}</span>{" "}
                  — это себестоимость плеча {Math.round(floor.km)} км: топливо{" "}
                  {floor.fuel_l.toFixed(0)} л × {ASSUMPTIONS.dieselPriceKztPerL} ₸ ÷ {ASSUMPTIONS.fuelShareOfOperatingCost}, с учётом того,
                  что груз занимает {Math.round(floor.charged_share * 100)}% кузова. Ниже этой суммы
                  перевозчик едет в убыток. Цену ставите вы — перевозчик может согласиться или
                  предложить свою.
                </p>
              ) : (
                <p className="mt-2.5 text-small text-ink-600">
                  Укажите маршрут и вес — покажем рекомендованный минимум.
                </p>
              )}
            </div>

            <div className="mt-3.5 grid gap-3 sm:grid-cols-2">
              <Field label="Кто отправляет">
                <input
                  value={shipper}
                  onChange={(event) => setShipper(event.target.value)}
                  placeholder="например «Магазин Береке»"
                  className={INPUT}
                />
              </Field>
              <Field label="Телефон для водителя">
                <input
                  type="tel"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  placeholder="+7 701 000 00 00"
                  className={`${INPUT} tnum`}
                />
              </Field>
            </div>
            <p className="mt-2 text-small text-ink-500">
              Водитель звонит по этому номеру перед выездом — уточнить подъезд и кто встречает.
            </p>

            <div className="mt-3.5 flex flex-col gap-2.5 sm:flex-row sm:items-center">
              <button
                onClick={place}
                disabled={phase === "saving" || !complete}
                className={buttonClass("primary", "md")}
              >
                {phase === "saving" ? "Размещаю…" : "Разместить заявку"}
              </button>
              <button onClick={() => setDraft(null)} className={buttonClass("ghost", "md")}>
                Отмена
              </button>
            </div>

            {!complete ? (
              <p className="mt-2 text-small text-warn">
                Нужны отправление, назначение, груз и вес.
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </Surface>
  );
}

interface PriceFloor {
  km: number;
  price_kzt: number;
  fuel_l: number;
  charged_share: number;
}

const INPUT =
  "w-full rounded-control border border-ink-300 bg-white px-3 py-2 text-body text-ink-900 " +
  "placeholder:text-ink-600 transition focus:border-brand-border focus:outline-none";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-caption uppercase text-ink-500">{label}</span>
      <span className="mt-1.5 block">{children}</span>
    </label>
  );
}

function Select({
  value,
  onChange,
  settlements,
}: {
  value: string;
  onChange: (value: string) => void;
  settlements: SettlementOption[];
}) {
  return (
    <select value={value} onChange={(event) => onChange(event.target.value)} className={INPUT}>
      <option value="">— не выбрано —</option>
      {settlements.map((settlement) => (
        <option key={settlement.id} value={settlement.id}>
          {settlement.name_ru}
          {settlement.name_kz !== settlement.name_ru ? ` / ${settlement.name_kz}` : ""}
        </option>
      ))}
    </select>
  );
}
