/**
 * Runs the engine against the seeded database and prints what it found.
 *
 * This exists to answer, with numbers rather than hope, the question the pitch
 * rests on: does the dispatcher actually find return loads and consolidations on
 * the real Mangystau road network?
 *
 * Three metrics are reported, deliberately from strongest to weakest, because a
 * pitch should lead with the claim that cannot be argued with:
 *
 *   1. Paid-kilometre share. Pure arithmetic over the assembled route. A truck
 *      that delivers one load and returns empty can never exceed 50%.
 *   2. Regional saving calibrated to the brief's own figure of ~40% empty
 *      running. Uses the organisers' number, not one of ours.
 *   3. Saving against one dedicated out-and-back per order. An upper bound,
 *      labelled as such, because a real carrier already combines some trips.
 *
 * Run: node scripts/check-dispatch.ts
 */

import { loadContext, loadOrders, proposeAcrossFleet } from "../lib/dispatch.ts";
import { ASSUMPTIONS, consumptionPerKm } from "../lib/engine/economics.ts";
import type { Order } from "../lib/types.ts";

/** Empty-running share in the region today, as stated in the hackathon brief. */
const REGIONAL_EMPTY_SHARE_TODAY = 0.4;

const KIND_LABEL: Record<string, string> = {
  backhaul: "обратная загрузка",
  consolidation: "консолидация",
  "backhaul+consolidation": "обратная + консолидация",
  single: "одиночный груз",
};

const fmt = (n: number) => Math.round(n).toLocaleString("ru-RU");

async function main() {
  const context = await loadContext();
  const pending = await loadOrders("new");
  const orderById = new Map(pending.map((o) => [o.id, o]));

  console.log(`Пунктов: ${context.settlements.length}   Заявок в пуле: ${pending.length}`);
  console.log(`Цена ДТ: ${ASSUMPTIONS.dieselPriceKztPerL} ₸/л\n`);

  const started = Date.now();
  const sets = await proposeAcrossFleet();
  const elapsed = Date.now() - started;

  console.log("ЛУЧШИЕ РЕЙСЫ\n");
  for (const { vehicle, plans } of sets.slice(0, 5)) {
    const plan = plans[0]!;
    const route = plan.stops
      .map((s) => `${context.nameOf(s.settlement_id)}${s.action === "pickup" ? "↑" : "↓"}`)
      .join(" → ");

    console.log(
      `${vehicle.plate}  ${vehicle.capacity_kg / 1000} т ${vehicle.kind}  из ${context.nameOf(vehicle.at_id)}`,
    );
    console.log(`  тип:      ${KIND_LABEL[plan.kind]}, грузов ${plan.order_ids.length}`);
    console.log(`  маршрут:  ${route}`);
    console.log(
      `  пробег:   ${plan.total_km} км, порожний ${plan.empty_km} км, ` +
        `оплачиваемых ${Math.round(plan.paid_km_share * 100)}%`,
    );
    console.log();
  }

  // ---- Aggregates -------------------------------------------------------

  let routeKm = 0;
  let ladenKm = 0;
  let emptyKm = 0;
  let dedicatedKm = 0;
  let payloadKm = 0;
  let fuelBurned = 0;
  const served: Order[] = [];
  const byKind = new Map<string, number>();

  for (const { vehicle, plans } of sets) {
    const plan = plans[0]!;
    routeKm += plan.total_km;
    ladenKm += plan.laden_km;
    emptyKm += plan.empty_km;
    dedicatedKm += plan.baseline_total_km;
    byKind.set(plan.kind, (byKind.get(plan.kind) ?? 0) + 1);

    for (const id of plan.order_ids) {
      const order = orderById.get(id);
      if (!order) continue;
      served.push(order);
      payloadKm += context.dist.km(order.origin_id, order.destination_id);
    }

    // Fuel actually burned by the assembled route, at this vehicle's rates.
    fuelBurned +=
      plan.laden_km * consumptionPerKm(vehicle, 0.6) + plan.empty_km * consumptionPerKm(vehicle, 0);
  }

  const paidShare = routeKm > 0 ? ladenKm / routeKm : 0;

  // Metric 2: to move the same cargo, today's fleet drives the loaded distance
  // plus its 40% empty tail.
  const todayKm = payloadKm / (1 - REGIONAL_EMPTY_SHARE_TODAY);
  // Costed with an average of the fleet's consumption rates, laden and empty split
  // the same way as today's ratio.
  const averageEmptyRate =
    sets.reduce((s, x) => s + consumptionPerKm(x.vehicle, 0), 0) / Math.max(1, sets.length);
  const averageLadenRate =
    sets.reduce((s, x) => s + consumptionPerKm(x.vehicle, 0.6), 0) / Math.max(1, sets.length);
  const todayFuel =
    payloadKm * averageLadenRate + (todayKm - payloadKm) * averageEmptyRate;

  console.log("─".repeat(72));
  console.log(`ИТОГО ПО ОДНОМУ ЦИКЛУ ПЛАНИРОВАНИЯ   (расчёт ${elapsed} мс)\n`);
  console.log(`  рейсов собрано:    ${sets.length} из ${new Set(sets.map((s) => s.vehicle.id)).size} машин`);
  console.log(`  заявок обслужено:  ${served.length} из ${pending.length}`);
  console.log(`  пробег плана:      ${fmt(routeKm)} км, из них порожних ${fmt(emptyKm)} км\n`);

  console.log("  1. ОПЛАЧИВАЕМЫЕ КИЛОМЕТРЫ  (чистая арифметика, оспорить нельзя)");
  console.log(`     доля гружёного пробега: ${Math.round(paidShare * 100)}%`);
  console.log(`     потолок для схемы «туда с грузом, обратно порожняком»: 50%\n`);

  console.log("  2. ЭКОНОМИЯ ПРОТИВ ТЕКУЩЕГО СОСТОЯНИЯ  (порожний пробег ~40%, цифра из кейса)");
  console.log(`     полезный пробег груза:  ${fmt(payloadKm)} км`);
  console.log(`     сегодня было бы:        ${fmt(todayKm)} км`);
  console.log(`     у нас:                  ${fmt(routeKm)} км`);
  if (todayKm > routeKm) {
    console.log(`     не поехали:             ${fmt(todayKm - routeKm)} км (${Math.round((1 - routeKm / todayKm) * 100)}%)`);
    console.log(`     топливо:                ${fmt(todayFuel - fuelBurned)} л, ${fmt((todayFuel - fuelBurned) * ASSUMPTIONS.dieselPriceKztPerL)} ₸`);
  } else {
    console.log(`     наш план ДЛИННЕЕ на ${fmt(routeKm - todayKm)} км — экономии нет`);
  }
  console.log();

  console.log("  3. ПРОТИВ ОТДЕЛЬНОГО РЕЙСА НА КАЖДУЮ ЗАЯВКУ  (верхняя граница, не для питча)");
  console.log(`     ${fmt(dedicatedKm)} км → ${fmt(routeKm)} км`);
  console.log();

  // Metric 4: the access story. Consignments a carrier would not cross the
  // region for on their own.
  const smallRemote = served.filter((o) => {
    const destination = context.byId.get(o.destination_id);
    const far = context.dist.km(o.origin_id, o.destination_id) > 100;
    const small = o.weight_kg < 1000;
    const remote = destination?.place === "village" || destination?.place === "hamlet";
    return far && small && remote;
  });
  console.log("  4. ДОСТУП ДЛЯ ОТДАЛЁННЫХ ПОСЁЛКОВ");
  console.log(`     обслужено мелких грузов (<1 т) дальше 100 км в село: ${smallRemote.length}`);
  for (const o of smallRemote.slice(0, 5)) {
    console.log(
      `       ${o.weight_kg} кг ${o.cargo} → ${context.nameOf(o.destination_id)} ` +
        `(${context.dist.km(o.origin_id, o.destination_id)} км)`,
    );
  }

  console.log("\nТипы рейсов:");
  for (const [kind, n] of [...byKind].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${(KIND_LABEL[kind] ?? kind).padEnd(26)} ${n}`);
  }
}

main().catch((err) => {
  console.error("FAILED:", err);
  process.exit(1);
});
