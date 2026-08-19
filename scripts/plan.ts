/**
 * Runs a planning cycle and stores the proposals.
 *
 * Run after seeding, and any time the order pool changes enough to be worth
 * re-planning: node scripts/plan.ts
 */

import { regenerateProposals } from "../lib/planning.ts";

const summary = await regenerateProposals();

console.log("Планирование завершено:");
console.log(`  рейсов предложено:   ${summary.trips}`);
console.log(`  заявок покрыто:      ${summary.orders_covered}`);
console.log(`  пробег:              ${summary.total_km} км, порожний ${summary.empty_km} км`);
console.log(`  оплачиваемых км:     ${Math.round(summary.paid_km_share * 100)}%`);
console.log(`  расчёт занял:        ${summary.took_ms} мс`);
