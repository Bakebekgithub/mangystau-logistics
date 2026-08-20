/**
 * The absurd cases are the point of this rule, so they are the tests.
 */

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { bodyFitsCargo, classifyCargo } from "../lib/engine/cargo-fit.ts";

describe("cargo and body", () => {
  it("keeps a tipper to loose freight", () => {
    assert.equal(bodyFitsCargo("tipper", "песок"), true);
    assert.equal(bodyFitsCargo("tipper", "цемент"), true);
    assert.equal(bodyFitsCargo("tipper", "кирпич"), true);
    // The cases that started this: a tipper is not a water lorry.
    assert.equal(bodyFitsCargo("tipper", "питьевая вода"), false);
    assert.equal(bodyFitsCargo("tipper", "помидоры"), false);
    assert.equal(bodyFitsCargo("tipper", "мебель"), false);
  });

  it("offers a reefer nothing but cold cargo", () => {
    assert.equal(bodyFitsCargo("refrigerator", "рыба"), true);
    assert.equal(bodyFitsCargo("refrigerator", "медикаменты"), true);
    assert.equal(bodyFitsCargo("refrigerator", "кирпич"), false);
    assert.equal(bodyFitsCargo("refrigerator", "арматура"), false);
    // Physically possible, economically wrong: the most expensive truck in the
    // fleet should not be sent after freight a tarpaulin body can carry.
    assert.equal(bodyFitsCargo("refrigerator", "запчасти"), false);
    assert.equal(bodyFitsCargo("refrigerator", "шерсть"), false);
    assert.equal(bodyFitsCargo("refrigerator", "питьевая вода"), false);
  });

  it("keeps food off an open flatbed", () => {
    assert.equal(bodyFitsCargo("flatbed", "арматура"), true);
    assert.equal(bodyFitsCargo("flatbed", "металлолом"), true);
    assert.equal(bodyFitsCargo("flatbed", "мясо"), false);
    assert.equal(bodyFitsCargo("flatbed", "продукты питания"), false);
  });

  it("lets a closed tarpaulin body do most of the work", () => {
    // Food does not require a reefer to be carried at all — whether it needs
    // cold is a separate property of the order.
    assert.equal(bodyFitsCargo("tent", "овощи"), true);
    assert.equal(bodyFitsCargo("tent", "бытовая техника"), true);
    assert.equal(bodyFitsCargo("tent", "арматура"), true);
    // But sand cannot be tipped out of a tarpaulin truck.
    assert.equal(bodyFitsCargo("tent", "щебень"), false);
  });

  it("survives the inflections a shipper actually types", () => {
    assert.equal(classifyCargo("3 тонны арматуры"), "heavy");
    assert.equal(classifyCargo("Стройматериалов на объект"), "heavy");
    assert.equal(classifyCargo("молочная продукция"), "perishable");
    assert.equal(classifyCargo("щебня самосвал"), "bulk");
  });

  it("does not mistake one word for another it merely contains", () => {
    // Every one of these was wrong at some point: substring matching is cheap
    // but it needs pinning down.
    assert.equal(classifyCargo("бытовая техника"), "general");
    assert.equal(bodyFitsCargo("flatbed", "бытовая техника"), false);
    assert.equal(classifyCargo("солома"), "general");
    assert.equal(classifyCargo("фасоль"), "general");
    assert.equal(classifyCargo("металлолом"), "bulk");
  });

  it("sends anything flagged for cold to a reefer, whatever it is called", () => {
    // The shipper's own requirement beats the keyword list: without this, an
    // order marked for cold but described as "запчасти" fitted no body at all.
    assert.equal(bodyFitsCargo("refrigerator", "запчасти", true), true);
    assert.equal(bodyFitsCargo("tent", "запчасти", true), false);
    assert.equal(bodyFitsCargo("flatbed", "продукты питания", true), false);
  });

  it("treats anything unfamiliar as packaged goods", () => {
    // The safe default: a closed body can take almost anything, an open one
    // or a tipper should not be offered a mystery.
    assert.equal(classifyCargo("подарки на новый год"), "general");
    assert.equal(bodyFitsCargo("tent", "подарки на новый год"), true);
    assert.equal(bodyFitsCargo("tipper", "подарки на новый год"), false);
  });
});
