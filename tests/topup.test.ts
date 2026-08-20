/**
 * Filling an already-agreed trip.
 *
 * Distances are the region's real ones, so a passing test means the engine works
 * on the geography it will actually meet rather than on a convenient triangle.
 */

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { findTopUp, type TopUpRequest } from "../lib/engine/topup.ts";
import type { DistanceTable, Order } from "../lib/types.ts";

// Aktau — Shetpe — Beyneu, road kilometres from the built matrix.
const KM: Record<string, number> = {
  "aktau|shetpe": 143.5,
  "shetpe|beyneu": 331.1,
  "aktau|beyneu": 469.5,
  "shetpe|kyzyltobe": 128.6,
  "aktau|kyzyltobe": 30.4,
  "beyneu|kyzyltobe": 447.9,
  "aktau|fort": 121.7,
  "beyneu|fort": 583.2,
  "shetpe|fort": 176.4,
  // Сенек — в стороне от трассы Актау → Бейнеу: заезд туда стоит 80 км крюка.
  "aktau|senek": 250.0,
  "senek|beyneu": 300.0,
};

const dist: DistanceTable = {
  has: (a, b) => a === b || `${a}|${b}` in KM || `${b}|${a}` in KM,
  km: (a, b) => {
    if (a === b) return 0;
    const value = KM[`${a}|${b}`] ?? KM[`${b}|${a}`];
    if (value === undefined) throw new Error(`no distance ${a}→${b}`);
    return value;
  },
  minutes: (a, b) => Math.round((dist.km(a, b) / 60) * 60),
};

function order(over: Partial<Order> & Pick<Order, "id" | "origin_id" | "destination_id">): Order {
  return {
    shipper_name: "Отправитель",
    cargo: "запчасти",
    weight_kg: 1000,
    needs_cooling: false,
    ready_at: "2026-08-20T06:00:00Z",
    deadline_at: "2026-08-25T18:00:00Z",
    status: "new",
    offered_price_kzt: 60000,
    ...over,
  } as Order;
}

const request: TopUpRequest = {
  origin_id: "aktau",
  destination_id: "beyneu",
  free_kg: 3000,
  capacity_kg: 10000,
  kind: "tent",
  fuel_per_100km: 22,
  now: new Date("2026-08-20T06:00:00Z"),
};

describe("дозагрузка попутного рейса", () => {
  it("предлагает груз почти по пути и отвергает далёкий", () => {
    const onTheWay = order({ id: "on", origin_id: "aktau", destination_id: "shetpe" });
    const offRoute = order({ id: "off", origin_id: "fort", destination_id: "kyzyltobe" });

    const result = findTopUp([onTheWay, offRoute], dist, request);
    const ids = result.along.map((c) => c.order.id);
    assert.ok(ids.includes("on"), "груз по пути должен предлагаться");
    assert.ok(!ids.includes("off"), "груз в стороне не должен предлагаться");
  });

  it("считает крюк, а не полное расстояние", () => {
    // Актау → Шетпе → Бейнеу почти совпадает с Актау → Бейнеу.
    const result = findTopUp(
      [order({ id: "on", origin_id: "aktau", destination_id: "shetpe" })],
      dist,
      request,
    );
    const candidate = result.along[0]!;
    assert.ok(candidate.detour_km < 10, `крюк ${candidate.detour_km} км должен быть мал`);
  });

  it("на обратном плече свободен весь кузов, а не только остаток", () => {
    // Восемь тонн не влезают в свободные три, но обратно машина идёт пустой.
    const heavy = order({
      id: "heavy",
      origin_id: "beyneu",
      destination_id: "aktau",
      weight_kg: 8000,
    });
    const result = findTopUp([heavy], dist, request);
    assert.equal(result.along.length, 0, "на прямом плече места нет");
    assert.equal(result.back.length, 1, "на обратном плече место есть");
  });

  it("не предлагает груз, который не окупает свой крюк", () => {
    const barelyPaid = order({
      id: "cheap",
      origin_id: "kyzyltobe",
      destination_id: "shetpe",
      offered_price_kzt: 500,
    });
    const result = findTopUp([barelyPaid], dist, request);
    assert.equal(result.along.length, 0);
  });

  it("не предлагает груз, у которого крюк съедает больше половины платы", () => {
    // 80 км крюка ради 8 000 ₸: в плюсе, но ради этого никто не поедет, а такие
    // строки в списке учат водителя список не читать.
    const notWorthIt = order({
      id: "meh",
      origin_id: "aktau",
      destination_id: "senek",
      offered_price_kzt: 8000,
    });
    const result = findTopUp([notWorthIt], dist, request);
    assert.equal(result.along.length, 0);
  });

  it("уважает кузов и холод", () => {
    const chilled = order({
      id: "fish",
      origin_id: "aktau",
      destination_id: "shetpe",
      cargo: "рыба",
      needs_cooling: true,
    });
    const gravel = order({
      id: "gravel",
      origin_id: "aktau",
      destination_id: "shetpe",
      cargo: "щебень",
      weight_kg: 2000,
    });

    const inTent = findTopUp([chilled, gravel], dist, request);
    assert.deepEqual(inTent.along.map((c) => c.order.id), [], "тент не берёт ни скоропорт без холода, ни навал");

    const inTipper = findTopUp([chilled, gravel], dist, { ...request, kind: "tipper" });
    assert.deepEqual(inTipper.along.map((c) => c.order.id), ["gravel"]);
  });

  it("ранжирует по остатку после топлива, а не по цене", () => {
    // Шетпе стоит на трассе — крюк 5 км. Сенек в стороне — крюк 80 км, и они
    // съедают разницу в цене. Сортировка по объявленной сумме поставила бы
    // Сенек первым и спрятала бы это от водителя.
    const onRoute = order({
      id: "near",
      origin_id: "aktau",
      destination_id: "shetpe",
      offered_price_kzt: 60000,
    });
    const offRoute = order({
      id: "far",
      origin_id: "aktau",
      destination_id: "senek",
      offered_price_kzt: 62000,
    });

    const result = findTopUp([onRoute, offRoute], dist, request);
    assert.equal(result.along[0]!.order.id, "near");
    assert.ok(
      result.along[0]!.net_kzt > result.along[1]!.net_kzt,
      "остаток после топлива у ближнего груза должен быть больше",
    );
  });

  it("отсекает груз, до которого крюк больше сотни километров", () => {
    // Форт-Шевченко в противоположной стороне: 235 км крюка. Водитель со своим
    // расписанием такое не рассматривает, поэтому и предлагать нечего.
    const wrongWay = order({ id: "wrong", origin_id: "fort", destination_id: "shetpe" });
    assert.equal(findTopUp([wrongWay], dist, request).along.length, 0);
  });
});
