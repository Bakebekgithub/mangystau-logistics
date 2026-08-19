import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { parseWithRules, normalise, type ParseContext } from "../lib/ai/parse-order.ts";
import type { Settlement } from "../lib/types.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const { settlements } = JSON.parse(
  readFileSync(join(ROOT, "data", "settlements.json"), "utf8"),
) as { settlements: Settlement[] };

const NOW = new Date("2026-08-19T06:00:00Z");
const context: ParseContext = { settlements, now: NOW };
const parse = (text: string) => parseWithRules(text, context);

describe("the dictionary parser reads real messages", () => {
  test("handles the canonical example end to end", () => {
    const order = parse("надо 3 тонны арматуры из Актау в Жанаозен завтра до обеда");

    assert.equal(order.origin_id, "aktau");
    assert.equal(order.destination_id, "zhanaozen");
    assert.equal(order.cargo, "арматура");
    assert.equal(order.weight_kg, 3000);
    assert.equal(order.needs_cooling, false);
    assert.deepEqual(order.warnings, []);

    // "завтра до обеда" — ready on the 20th, deadline noon the same day.
    assert.equal(new Date(order.ready_at!).getUTCDate(), 20);
    assert.equal(new Date(order.deadline_at!).getUTCDate(), 20);
    assert.ok(new Date(order.deadline_at!) > new Date(order.ready_at!));
  });

  test("reads Kazakh spellings of the same places", () => {
    const order = parse("Ақтау дан Жаңаөзен ге 2 тонна цемент");
    assert.equal(order.origin_id, "aktau");
    assert.equal(order.destination_id, "zhanaozen");
    assert.equal(order.weight_kg, 2000);
  });

  test("handles Russian case endings", () => {
    const order = parse("из Жанаозена до Актау 500 кг рыбы срочно");
    assert.equal(order.origin_id, "zhanaozen");
    assert.equal(order.destination_id, "aktau");
    assert.equal(order.weight_kg, 500);
    assert.equal(order.needs_cooling, true, "рыба должна требовать рефрижератор");
  });

  test("falls back to reading order when there are no prepositions", () => {
    const order = parse("Шетпе Бейнеу 1.5 т стройматериалы");
    assert.equal(order.origin_id, "shetpe");
    assert.equal(order.destination_id, "beyneu");
    assert.equal(order.weight_kg, 1500);
  });

  test("recognises a small consignment to a remote village", () => {
    const order = parse("400 кг продуктов из Актау в Сенек");
    assert.equal(order.origin_id, "aktau");
    assert.equal(order.destination_id, "senek");
    assert.equal(order.weight_kg, 400);
    assert.equal(order.needs_cooling, true);
  });

  test("prefers the longer cargo phrase", () => {
    assert.equal(parse("везём молочную продукцию из Курыка в Актау").cargo, "молочная продукция");
  });

  test("converts fractional tonnes", () => {
    assert.equal(parse("2,5 тонны цемента из Актау в Шетпе").weight_kg, 2500);
  });
});

describe("the parser admits what it does not know", () => {
  test("flags a missing destination instead of guessing one", () => {
    const order = parse("3 тонны арматуры из Актау");
    assert.equal(order.origin_id, "aktau");
    assert.equal(order.destination_id, null);
    assert.ok(order.warnings.some((w) => /назначен/i.test(w)));
  });

  test("flags missing weight and cargo", () => {
    const order = parse("что-нибудь из Актау в Жанаозен");
    assert.equal(order.weight_kg, null);
    assert.equal(order.cargo, null);
    assert.equal(order.warnings.length, 2);
  });

  test("never returns the same settlement for both ends", () => {
    const order = parse("из Актау в Актау 1 т песка");
    assert.equal(order.destination_id, null);
  });

  test("ignores places outside the region", () => {
    const order = parse("2 тонны мебели из Алматы в Астану");
    assert.equal(order.origin_id, null);
    assert.equal(order.destination_id, null);
  });

  test("always produces a valid time window", () => {
    for (const text of ["груз из Актау в Бейнеу", "срочно из Актау в Бейнеу", "послезавтра из Актау в Бейнеу"]) {
      const order = parse(text);
      assert.ok(order.ready_at && order.deadline_at, text);
      assert.ok(new Date(order.deadline_at!) > new Date(order.ready_at!), text);
    }
  });
});

describe("normalisation", () => {
  test("folds Kazakh letters onto Russian equivalents", () => {
    assert.equal(normalise("Ақтау"), "актау");
    assert.equal(normalise("Жаңаөзен"), "жанаозен");
    assert.equal(normalise("Құрық"), "курык");
  });
});
