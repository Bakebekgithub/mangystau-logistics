import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { buildDistanceTable } from "../lib/distance.ts";
import { baselineForOrders, evaluateRoute, consumptionPerKm, savingsAgainstBaseline } from "../lib/engine/economics.ts";
import { DEFAULT_MATCH_OPTIONS, proposeTrips } from "../lib/engine/matching.ts";
import type { Order, Vehicle } from "../lib/types.ts";

/**
 * A deliberately round fixture geography, so every assertion below can be
 * checked by hand. Real distances are exercised by the seeded database.
 */
const dist = buildDistanceTable([
  { from_id: "aktau", to_id: "zhanaozen", km: 150, minutes: 150 },
  { from_id: "aktau", to_id: "senek", km: 100, minutes: 100 },
  { from_id: "aktau", to_id: "kuryk", km: 80, minutes: 80 },
  { from_id: "zhanaozen", to_id: "senek", km: 60, minutes: 60 },
  { from_id: "zhanaozen", to_id: "kuryk", km: 90, minutes: 90 },
  { from_id: "senek", to_id: "kuryk", km: 50, minutes: 50 },
]);

const NAMES: Record<string, string> = {
  aktau: "Актау",
  zhanaozen: "Жанаозен",
  senek: "Сенек",
  kuryk: "Курык",
};
const nameOf = (id: string) => NAMES[id] ?? id;

function truck(overrides: Partial<Vehicle> = {}): Vehicle {
  return {
    id: "v1",
    carrier_id: "c1",
    plate: "KZ 001 AA",
    kind: "tent",
    capacity_kg: 5000,
    fuel_per_100km: 22,
    at_id: "aktau",
    ...overrides,
  };
}

function order(overrides: Partial<Order> & { id: string }): Order {
  return {
    shipper_name: "Тест",
    origin_id: "aktau",
    destination_id: "zhanaozen",
    cargo: "груз",
    weight_kg: 1000,
    needs_cooling: false,
    ready_at: "2026-08-19T06:00:00Z",
    deadline_at: "2026-08-25T18:00:00Z",
    status: "new",
    ...overrides,
  } as Order;
}

const NOW = new Date("2026-08-19T08:00:00Z");
const options = { ...DEFAULT_MATCH_OPTIONS, now: NOW };

describe("distance table", () => {
  test("is symmetric and knows identity", () => {
    assert.equal(dist.km("aktau", "zhanaozen"), 150);
    assert.equal(dist.km("zhanaozen", "aktau"), 150);
    assert.equal(dist.km("aktau", "aktau"), 0);
    assert.ok(dist.has("aktau", "aktau"));
  });

  test("throws on an unknown pair instead of reporting zero", () => {
    assert.equal(dist.has("aktau", "nowhere"), false);
    assert.throws(() => dist.km("aktau", "nowhere"), /no road distance/);
  });
});

describe("fuel model", () => {
  test("an empty truck burns its base rate", () => {
    assert.equal(consumptionPerKm(truck(), 0), 0.22);
  });

  test("a full truck burns 30% more", () => {
    assert.equal(Math.round(consumptionPerKm(truck(), 1) * 10000) / 10000, 0.286);
  });

  test("load fraction is clamped, so bad input cannot inflate savings", () => {
    assert.equal(consumptionPerKm(truck(), 5), consumptionPerKm(truck(), 1));
    assert.equal(consumptionPerKm(truck(), -2), consumptionPerKm(truck(), 0));
  });
});

describe("route evaluation", () => {
  test("charges the return leg and separates laden from empty kilometres", () => {
    const one = order({ id: "o1", weight_kg: 3000 });
    const route = evaluateRoute(
      truck(),
      [
        { seq: 1, settlement_id: "aktau", action: "pickup", order_id: "o1" },
        { seq: 2, settlement_id: "zhanaozen", action: "dropoff", order_id: "o1" },
      ],
      new Map([["o1", one]]),
      dist,
    );

    // Out laden 150, back to base empty 150.
    assert.equal(route.total_km, 300);
    assert.equal(route.laden_km, 150);
    assert.equal(route.empty_km, 150);
    assert.equal(route.paid_km_share, 0.5);
  });

  test("refuses a sequence that ends with cargo aboard", () => {
    const one = order({ id: "o1" });
    assert.throws(
      () =>
        evaluateRoute(
          truck(),
          [{ seq: 1, settlement_id: "aktau", action: "pickup", order_id: "o1" }],
          new Map([["o1", one]]),
          dist,
        ),
      /cargo still aboard/,
    );
  });
});

describe("baseline", () => {
  test("is one dedicated out-and-back run per order", () => {
    const baseline = baselineForOrders([order({ id: "o1" })], truck(), dist);
    assert.equal(baseline.total_km, 300);
    assert.equal(baseline.empty_km, 150);
  });
});

describe("backhaul matching", () => {
  const outbound = order({ id: "out", origin_id: "aktau", destination_id: "zhanaozen", weight_kg: 3000 });
  const back = order({ id: "back", origin_id: "zhanaozen", destination_id: "aktau", weight_kg: 1200 });

  test("pairs a return load and removes the empty leg entirely", () => {
    const [best] = proposeTrips(truck(), [outbound, back], dist, nameOf, options);

    assert.ok(best, "expected at least one proposal");
    assert.equal(best.order_ids.length, 2);
    assert.equal(best.empty_km, 0);
    assert.equal(best.total_km, 300);
    // Two dedicated runs: 300 km each.
    assert.equal(best.baseline_total_km, 600);
    assert.equal(best.baseline_empty_km, 300);
    assert.equal(best.paid_km_share, 1);
    assert.match(best.kind, /backhaul/);
  });

  test("reports fuel and money saved against that baseline", () => {
    const [best] = proposeTrips(truck(), [outbound, back], dist, nameOf, options);
    assert.ok(best!.fuel_saved_l > 0);
    assert.ok(best!.money_saved_kzt > 0);
  });

  test("explains itself in words a driver can read", () => {
    const [best] = proposeTrips(truck(), [outbound, back], dist, nameOf, options);
    assert.match(best!.explanation, /обратн/i);
  });
});

describe("consolidation for remote villages", () => {
  // Three consignments too small to justify a trip of their own.
  const small = [
    order({ id: "s1", origin_id: "aktau", destination_id: "senek", weight_kg: 400 }),
    order({ id: "s2", origin_id: "aktau", destination_id: "kuryk", weight_kg: 400 }),
    order({ id: "s3", origin_id: "aktau", destination_id: "zhanaozen", weight_kg: 400 }),
  ];

  test("combines them into a single run that beats separate trips", () => {
    const [best] = proposeTrips(truck(), small, dist, nameOf, options);

    assert.ok(best, "expected a proposal");
    assert.equal(best.order_ids.length, 3);
    // Separately: 200 + 160 + 300 = 660 km.
    assert.equal(best.baseline_total_km, 660);
    assert.ok(best.total_km < best.baseline_total_km);
    assert.ok(best.total_km <= 340, `expected an optimal-ish route, got ${best.total_km}`);
  });

  test("never proposes a route longer than doing the orders separately", () => {
    for (const plan of proposeTrips(truck(), small, dist, nameOf, options)) {
      assert.ok(
        plan.total_km <= plan.baseline_total_km,
        `plan drove ${plan.total_km} km against a ${plan.baseline_total_km} km baseline`,
      );
    }
  });
});

describe("feasibility rules", () => {
  test("an order heavier than the truck is never offered", () => {
    const heavy = order({ id: "heavy", weight_kg: 9000 });
    assert.equal(proposeTrips(truck({ capacity_kg: 5000 }), [heavy], dist, nameOf, options).length, 0);
  });

  test("chilled cargo goes only to a refrigerated truck", () => {
    const chilled = order({ id: "fish", needs_cooling: true, weight_kg: 800 });
    assert.equal(proposeTrips(truck({ kind: "tent" }), [chilled], dist, nameOf, options).length, 0);
    assert.ok(proposeTrips(truck({ kind: "refrigerator" }), [chilled], dist, nameOf, options).length > 0);
  });

  test("an expired order is not offered", () => {
    const stale = order({ id: "stale", deadline_at: "2026-08-18T10:00:00Z" });
    assert.equal(proposeTrips(truck(), [stale], dist, nameOf, options).length, 0);
  });

  test("capacity is enforced across a combination, not just per order", () => {
    const a = order({ id: "a", origin_id: "aktau", destination_id: "zhanaozen", weight_kg: 3000 });
    const b = order({ id: "b", origin_id: "aktau", destination_id: "senek", weight_kg: 3000 });
    for (const plan of proposeTrips(truck({ capacity_kg: 5000 }), [a, b], dist, nameOf, options)) {
      // Both aboard at once would be 6000 kg, so any two-order plan must drop
      // one before collecting the other — impossible from a shared origin.
      if (plan.order_ids.length === 2) {
        const pickups = plan.stops.filter((s) => s.action === "pickup").map((s) => s.seq);
        const firstDropoff = plan.stops.find((s) => s.action === "dropoff")!.seq;
        assert.ok(
          Math.max(...pickups) > firstDropoff,
          "two 3-tonne orders must not be carried simultaneously",
        );
      }
    }
  });
});

describe("savings arithmetic", () => {
  test("is zero when the assembled route equals the baseline", () => {
    const route = { total_km: 300, empty_km: 150, laden_km: 150, fuel_l: 70, minutes: 300, segments: [], paid_km_share: 0.5 };
    const baseline = { total_km: 300, empty_km: 150, fuel_l: 70, minutes: 300 };
    const savings = savingsAgainstBaseline(route, baseline);
    assert.equal(savings.km_saved, 0);
    assert.equal(savings.money_saved_kzt, 0);
    assert.equal(savings.share_of_baseline, 0);
  });
});

describe("three small consignments from one hub", () => {
  /**
   * The product's headline claim, as a test.
   *
   * Real distances from the region: Aktau→Senek is the long haul at 200 km, and
   * Kuryk and Zhetybay sit near that corridor. A single run must beat three.
   */
  const hub = buildDistanceTable([
    { from_id: "aktau", to_id: "senek", km: 200, minutes: 150 },
    { from_id: "aktau", to_id: "kuryk", km: 71, minutes: 60 },
    { from_id: "aktau", to_id: "zhetybay", km: 93, minutes: 75 },
    { from_id: "senek", to_id: "kuryk", km: 180, minutes: 140 },
    { from_id: "senek", to_id: "zhetybay", km: 126, minutes: 100 },
    { from_id: "kuryk", to_id: "zhetybay", km: 51, minutes: 45 },
  ]);

  const orders = [
    order({ id: "c1", origin_id: "aktau", destination_id: "senek", weight_kg: 400 }),
    order({ id: "c2", origin_id: "aktau", destination_id: "kuryk", weight_kg: 700 }),
    order({ id: "c3", origin_id: "aktau", destination_id: "zhetybay", weight_kg: 300 }),
  ];

  test("all three go into one trip, not three", () => {
    const [best] = proposeTrips(truck({ capacity_kg: 5000 }), orders, hub, (id) => id, options);
    assert.ok(best, "expected a proposal");
    assert.equal(best.order_ids.length, 3, `expected one trip with all three, got ${best.order_ids.length}`);
    assert.equal(best.kind, "consolidation");
  });

  test("and that trip is shorter than three separate runs", () => {
    const [best] = proposeTrips(truck({ capacity_kg: 5000 }), orders, hub, (id) => id, options);
    // Separately: 2×(200 + 71 + 93) = 728 km.
    assert.equal(best!.baseline_total_km, 728);
    assert.ok(best!.total_km < 500, `expected well under 500 km, got ${best!.total_km}`);
  });
});
