import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { routeSummary } from "../lib/format.ts";
import { ASSUMPTIONS, indicativePriceKzt } from "../lib/engine/economics.ts";

describe("route summary", () => {
  test("marks a closed loop instead of printing the same place twice", () => {
    // The bug this replaces rendered "Бейнеу → Бейнеу", which reads as broken.
    const summary = routeSummary(["Бейнеу", "Батыр", "Кызылтобе", "Бейнеу"]);
    assert.match(summary, /^Бейнеу → Батыр → Кызылтобе → Бейнеу ⟲$/);
  });

  test("collapses consecutive repeats — several stops in one settlement", () => {
    const summary = routeSummary(["Актау", "Актау", "Жанаозен", "Жанаозен", "Актау"]);
    assert.equal(summary, "Актау → Жанаозен → Актау ⟲");
  });

  test("shortens a long route and says how many stops are hidden", () => {
    const summary = routeSummary(
      ["Актау", "Шетпе", "Жетыбай", "Сенек", "Курык", "Актау"],
      { maxParts: 4 },
    );
    assert.equal(summary, "Актау → Шетпе → +3 → Актау ⟲");
  });

  test("handles a one-way route without the loop mark", () => {
    assert.equal(routeSummary(["Актау", "Жанаозен"]), "Актау → Жанаозен");
  });

  test("survives degenerate input", () => {
    assert.equal(routeSummary([]), "—");
    assert.equal(routeSummary(["Актау"]), "Актау");
    assert.equal(routeSummary(["Актау", "Актау"]), "Актау");
  });
});

describe("indicative price", () => {
  test("is derived from fuel cost and the stated cost share", () => {
    const litres = 100;
    const expected = (litres * ASSUMPTIONS.dieselPriceKztPerL) / ASSUMPTIONS.fuelShareOfOperatingCost;
    // Rounded to the nearest 500 so it reads as an estimate, not a quote.
    assert.equal(indicativePriceKzt(litres), Math.round(expected / 500) * 500);
    assert.equal(indicativePriceKzt(litres) % 500, 0);
  });

  test("grows with fuel burned", () => {
    assert.ok(indicativePriceKzt(200) > indicativePriceKzt(100));
  });

  test("is zero for no fuel rather than throwing", () => {
    assert.equal(indicativePriceKzt(0), 0);
  });
});
