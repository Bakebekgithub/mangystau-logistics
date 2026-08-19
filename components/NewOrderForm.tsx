"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import type { ParsedOrder } from "@/lib/ai/parse-order";
import { weight, when } from "@/lib/format";

interface SettlementOption {
  id: string;
  name_ru: string;
  name_kz: string;
}

const EXAMPLES = [
  "надо 3 тонны арматуры из Актау в Жанаозен завтра до обеда",
  "Магазину в Сенеке нужно завезти продуктов, кило 400. Забрать с базы в Актау",
  "рыбу свежую 800 кг с Форт-Шевченко надо в Актау, срочно",
];

/**
 * The shipper's whole interface: one text box.
 *
 * The parse is shown for confirmation before anything is written, because a
 * mistyped destination should be caught on screen rather than when a truck turns
 * up in the wrong village. Every field stays editable.
 */
export function NewOrderForm({ settlements }: { settlements: SettlementOption[] }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [draft, setDraft] = useState<ParsedOrder | null>(null);
  const [shipper, setShipper] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleParse() {
    setBusy(true);
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
      setBusy(false);
    }
  }

  async function handleCreateOrder() {
    if (!draft) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...draft, shipper_name: shipper || "Отправитель", raw_text: text }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Не удалось создать заявку");
      setText("");
      setDraft(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  }

  const ready = draft?.origin_id && draft?.destination_id && draft?.cargo && draft?.weight_kg;

  return (
    <div className="rounded-xl border border-sand-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-sand-900">Новая заявка</h2>
      <p className="mt-1 text-sm text-sand-600">
        Напишите своими словами, как в мессенджере. Ничего заполнять по полям не нужно.
      </p>

      <textarea
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          setDraft(null);
        }}
        rows={3}
        placeholder="надо 3 тонны арматуры из Актау в Жанаозен завтра до обеда"
        className="mt-3 w-full resize-y rounded-lg border border-sand-300 p-3 text-sand-900 outline-none focus:border-caspian-500"
      />

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          onClick={handleParse}
          disabled={busy || text.trim().length === 0}
          className="rounded-lg bg-caspian-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-caspian-700 disabled:opacity-40"
        >
          {busy && !draft ? "Разбираю…" : "Разобрать сообщение"}
        </button>
        <span className="text-xs text-sand-500">или попробуйте пример:</span>
        {EXAMPLES.map((example, index) => (
          <button
            key={example}
            onClick={() => {
              setText(example);
              setDraft(null);
            }}
            className="rounded-md bg-sand-100 px-2 py-1 text-xs text-sand-700 hover:bg-sand-200"
          >
            {index + 1}
          </button>
        ))}
      </div>

      {error ? (
        <p className="mt-3 rounded-lg bg-orange-50 p-3 text-sm text-empty">{error}</p>
      ) : null}

      {draft ? (
        <div className="mt-4 rounded-lg border border-caspian-200 bg-caspian-50 p-4">
          <div className="flex items-center justify-between">
            <h3 className="font-medium text-sand-900">Мы поняли так</h3>
            <span className="rounded-full bg-white px-2 py-0.5 text-xs text-sand-600">
              {draft.parsed_by === "ai" ? "разобрано ИИ" : "разобрано по словарю региона"}
            </span>
          </div>

          <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            <Field label="Откуда">
              <select
                value={draft.origin_id ?? ""}
                onChange={(e) => setDraft({ ...draft, origin_id: e.target.value || null })}
                className="w-full rounded border border-sand-300 bg-white px-2 py-1"
              >
                <option value="">— не выбрано —</option>
                {settlements.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name_ru}
                    {s.name_kz !== s.name_ru ? ` / ${s.name_kz}` : ""}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Куда">
              <select
                value={draft.destination_id ?? ""}
                onChange={(e) => setDraft({ ...draft, destination_id: e.target.value || null })}
                className="w-full rounded border border-sand-300 bg-white px-2 py-1"
              >
                <option value="">— не выбрано —</option>
                {settlements.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name_ru}
                    {s.name_kz !== s.name_ru ? ` / ${s.name_kz}` : ""}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Груз">
              <input
                value={draft.cargo ?? ""}
                onChange={(e) => setDraft({ ...draft, cargo: e.target.value })}
                placeholder="например, арматура"
                className="w-full rounded border border-sand-300 bg-white px-2 py-1"
              />
            </Field>
            <Field label="Вес, кг">
              <input
                type="number"
                min={1}
                value={draft.weight_kg ?? ""}
                onChange={(e) =>
                  setDraft({ ...draft, weight_kg: e.target.value ? Number(e.target.value) : null })
                }
                className="w-full rounded border border-sand-300 bg-white px-2 py-1"
              />
              {draft.weight_kg ? (
                <span className="ml-2 text-xs text-sand-500">{weight(draft.weight_kg)}</span>
              ) : null}
            </Field>
            <Field label="Готов">
              <span className="text-sand-800">{draft.ready_at ? when(draft.ready_at) : "—"}</span>
            </Field>
            <Field label="Срок">
              <span className="text-sand-800">{draft.deadline_at ? when(draft.deadline_at) : "—"}</span>
            </Field>
          </dl>

          <label className="mt-3 flex items-center gap-2 text-sm text-sand-800">
            <input
              type="checkbox"
              checked={draft.needs_cooling}
              onChange={(e) => setDraft({ ...draft, needs_cooling: e.target.checked })}
            />
            Нужен рефрижератор
          </label>

          {draft.warnings.length > 0 ? (
            <ul className="mt-3 space-y-1 text-sm text-empty">
              {draft.warnings.map((warning) => (
                <li key={warning}>• {warning}</li>
              ))}
            </ul>
          ) : null}

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <input
              value={shipper}
              onChange={(e) => setShipper(e.target.value)}
              placeholder="Ваше название, например «Магазин Береке»"
              className="flex-1 rounded border border-sand-300 bg-white px-2 py-1.5 text-sm"
            />
            <button
              onClick={handleCreateOrder}
              disabled={busy || !ready}
              className="rounded-lg bg-laden px-4 py-2 text-sm font-medium text-white transition hover:brightness-110 disabled:opacity-40"
            >
              {busy ? "Размещаю…" : "Всё верно, разместить"}
            </button>
            <button
              onClick={() => setDraft(null)}
              className="rounded-lg px-3 py-2 text-sm text-sand-600 hover:bg-sand-100"
            >
              Отмена
            </button>
          </div>
          {!ready ? (
            <p className="mt-2 text-xs text-empty">
              Заполните откуда, куда, груз и вес — тогда заявку можно разместить.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-sand-500">{label}</dt>
      <dd className="mt-0.5 flex items-center">{children}</dd>
    </div>
  );
}
