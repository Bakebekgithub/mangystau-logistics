/**
 * The recommended price is a floor, and a pitch will be questioned on it, so
 * the properties it claims are asserted rather than assumed.
 */

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { ASSUMPTIONS, recommendedOrderPriceKzt } from "../lib/engine/economics.ts";

describe("recommended price", () => {
  it("grows with distance", () => {
    const near = recommendedOrderPriceKzt(150, 3000).price_kzt;
    const far = recommendedOrderPriceKzt(470, 3000).price_kzt;
    assert.ok(far > near, `${far} should exceed ${near}`);
  });

  it("charges a small consignment for a floor share, not a proportional one", () => {
    // 300 kg in a 3 t truck is a tenth of the body, but nobody hauls a tenth of
    // a truck for a tenth of the money.
    const small = recommendedOrderPriceKzt(200, 300);
    assert.equal(small.charged_share, 0.3);

    const full = recommendedOrderPriceKzt(200, 3000);
    assert.ok(small.price_kzt > full.price_kzt / 10);
    assert.ok(small.price_kzt < full.price_kzt);
  });

  it("prices a full load against a truck that can actually carry it", () => {
    assert.equal(recommendedOrderPriceKzt(100, 2500).capacity_kg, 3000);
    assert.equal(recommendedOrderPriceKzt(100, 4000).capacity_kg, 5000);
    assert.equal(recommendedOrderPriceKzt(100, 9000).capacity_kg, 10000);
    // Above the largest class it still returns a figure rather than throwing.
    assert.equal(recommendedOrderPriceKzt(100, 30000).capacity_kg, 15000);
  });

  it("covers the fuel it is derived from", () => {
    const { price_kzt, fuel_l } = recommendedOrderPriceKzt(300, 5000);
    const fuelCost = fuel_l * ASSUMPTIONS.dieselPriceKztPerL;
    // The floor is fuel scaled up by the share of costs fuel represents, so it
    // must exceed the fuel bill itself by a wide margin.
    assert.ok(price_kzt > fuelCost, `${price_kzt} should exceed fuel ${fuelCost}`);
    assert.ok(price_kzt < fuelCost / ASSUMPTIONS.fuelShareOfOperatingCost + 1000);
  });

  it("reads as an estimate, not a quote", () => {
    for (const km of [37, 112, 289, 431]) {
      const { price_kzt } = recommendedOrderPriceKzt(km, 2000);
      assert.equal(price_kzt % 500, 0, `${price_kzt} should round to 500`);
    }
  });

  it("never recommends a derisory figure for a short hop", () => {
    assert.ok(recommendedOrderPriceKzt(3, 100).price_kzt >= 2000);
  });
});
