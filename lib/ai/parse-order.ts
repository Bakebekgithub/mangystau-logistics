/**
 * Turns a message a shipper actually typed into a structured order.
 *
 * This is the one place AI carries weight in the product. The brief names the
 * problem plainly: today orders live in phone calls and messenger threads. So the
 * input here is the raw message — "надо 3 тонны арматуры из Актау в Жанаозен
 * завтра до обеда" — and the output is a routable order. Remove this and the
 * product stops meeting shippers where they already are.
 *
 * Two implementations, one contract:
 *
 *   - Claude, constrained by a JSON schema whose settlement fields are enums of
 *     the 65 real settlement ids. The model cannot invent a place that isn't in
 *     Mangystau, because the schema won't let it.
 *   - A deterministic parser over the same settlement dictionary, used when no
 *     API key is configured or the call fails. Less forgiving of odd phrasing,
 *     but it works offline and it is what gets demonstrated if the network dies
 *     on stage.
 *
 * Both report which one ran, and that is shown in the UI rather than hidden.
 */

import Anthropic from "@anthropic-ai/sdk";

import type { Settlement } from "../types.ts";

export interface ParsedOrder {
  origin_id: string | null;
  destination_id: string | null;
  cargo: string | null;
  weight_kg: number | null;
  needs_cooling: boolean;
  ready_at: string | null;
  deadline_at: string | null;
  parsed_by: "ai" | "rules";
  /** Anything the shipper still needs to confirm or fill in. */
  warnings: string[];
}

export interface ParseContext {
  settlements: Settlement[];
  /** Reference moment for relative phrases like "завтра до обеда". */
  now: Date;
}

/**
 * Cargo that needs a refrigerated truck in Mangystau's summer heat — a regional
 * condition the brief calls out explicitly.
 */
const COOLING_HINTS = [
  "рыб", "мяс", "молоч", "молок", "кумыс", "скоропорт", "мороз", "продукт",
  "медикамент", "лекарств", "овощ", "фрукт", "яйц", "куриц", "курин",
];

/** Common cargo words, used by the deterministic parser to name the load. */
const CARGO_WORDS = [
  "арматура", "цемент", "стройматериалы", "кирпич", "песок", "щебень", "трубы",
  "продукты", "продукты питания", "вода", "питьевая вода", "мебель", "техника",
  "бытовая техника", "запчасти", "медикаменты", "корм", "корм для скота",
  "рыба", "мясо", "молоко", "молочная продукция", "кумыс", "шерсть", "овощи",
  "фрукты", "металлолом", "оборудование", "инструменты", "топливо", "уголь",
  "мука", "сахар", "мазут", "спецодежда", "плитка", "гипсокартон", "утеплитель",
];

const ORIGIN_PREPOSITIONS = ["из", "с", "со", "от"];
const DESTINATION_PREPOSITIONS = ["в", "во", "до", "на", "к"];

/**
 * Folds Kazakh letters onto their nearest Russian equivalents so "Ақтау" and
 * "Актау" match the same settlement, and strips everything that isn't a letter
 * or digit.
 */
export function normalise(text: string): string {
  const folds: Record<string, string> = {
    қ: "к", ғ: "г", ң: "н", ө: "о", ұ: "у", ү: "у", һ: "х", і: "и", ә: "а",
    ё: "е", й: "и",
  };
  return text
    .toLowerCase()
    .split("")
    .map((ch) => folds[ch] ?? ch)
    .join("");
}

function tokenise(text: string): string[] {
  return normalise(text)
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * Stem used to match a settlement name against inflected text: Russian case
 * endings mean "до Жанаозена" must still find "Жанаозен".
 */
function settlementStems(settlement: Settlement): string[] {
  const names = [settlement.name_ru, settlement.name_kz].filter(Boolean);
  const stems = new Set<string>();
  for (const name of names) {
    const normalised = normalise(name).replace(/[^\p{L}\p{N}]+/gu, "");
    if (normalised.length >= 4) stems.add(normalised);
  }
  return [...stems];
}

interface Mention {
  settlement: Settlement;
  tokenIndex: number;
  role: "origin" | "destination" | "unknown";
}

/** Finds settlement mentions and reads their role from the preceding preposition. */
function findMentions(tokens: string[], settlements: Settlement[]): Mention[] {
  const mentions: Mention[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!;
    if (token.length < 4) continue;

    let matched: Settlement | null = null;
    let matchedLength = 0;

    for (const settlement of settlements) {
      for (const stem of settlementStems(settlement)) {
        // The token may carry a case ending ("жанаозена"), or the name may be
        // multi-word and the token only its first part ("форт").
        const hit = token.startsWith(stem) || stem.startsWith(token);
        if (hit && stem.length > matchedLength) {
          matched = settlement;
          matchedLength = stem.length;
        }
      }
    }

    if (!matched) continue;
    if (mentions.some((m) => m.settlement.id === matched!.id)) continue;

    const previous = i > 0 ? tokens[i - 1]! : "";
    const role: Mention["role"] = ORIGIN_PREPOSITIONS.includes(previous)
      ? "origin"
      : DESTINATION_PREPOSITIONS.includes(previous)
        ? "destination"
        : "unknown";

    mentions.push({ settlement: matched, tokenIndex: i, role });
  }

  return mentions;
}

function resolveEndpoints(mentions: Mention[]): {
  origin: Settlement | null;
  destination: Settlement | null;
} {
  const origin = mentions.find((m) => m.role === "origin")?.settlement ?? null;
  const destination = mentions.find((m) => m.role === "destination")?.settlement ?? null;
  if (origin && destination) return { origin, destination };

  // No prepositions to go on: fall back to reading order, which is how these
  // messages are almost always written.
  const unassigned = mentions.filter(
    (m) => m.settlement.id !== origin?.id && m.settlement.id !== destination?.id,
  );
  return {
    origin: origin ?? unassigned[0]?.settlement ?? null,
    destination: destination ?? unassigned.find((m) => m.settlement.id !== (origin ?? unassigned[0]?.settlement)?.id)?.settlement ?? null,
  };
}

/**
 * Reads a weight, tonnes first.
 *
 * Note the unit boundaries are written as `(?![\p{L}])` rather than `\b`: in
 * JavaScript `\b` is defined against ASCII word characters, so `т\b` never
 * matches a Cyrillic "т" followed by a space. Written units are matched
 * longest-first so "тонны" is not mistaken for a bare "т".
 */
function parseWeight(text: string): number | null {
  const normalised = normalise(text);
  const tonnes = normalised.match(/(\d+(?:[.,]\d+)?)\s*(?:тонн\p{L}*|тн|т)(?![\p{L}])/u);
  if (tonnes) {
    const value = Number.parseFloat(tonnes[1]!.replace(",", "."));
    if (Number.isFinite(value) && value > 0) return Math.round(value * 1000);
  }
  const kilos = normalised.match(/(\d+(?:[.,]\d+)?)\s*(?:килограмм\p{L}*|кг)(?![\p{L}])/u);
  if (kilos) {
    const value = Number.parseFloat(kilos[1]!.replace(",", "."));
    if (Number.isFinite(value) && value > 0) return Math.round(value);
  }
  return null;
}

/**
 * Crude Russian stem: enough to match "арматуры" against "арматура" and "рыбы"
 * against "рыба" without pulling in a morphology library.
 */
function stemOf(word: string): string {
  const normalised = normalise(word);
  if (normalised.length <= 5) return normalised.replace(/[аяоеыиуюэь]$/, "");
  return normalised.slice(0, Math.max(5, normalised.length - 2));
}

function parseCargo(text: string): string | null {
  const haystack = normalise(text);
  // A multi-word phrase matches only if every one of its stems is present, and
  // the longest matching phrase wins so "молочная продукция" beats "продукты".
  const found = CARGO_WORDS.filter((phrase) =>
    phrase.split(/\s+/).every((word) => haystack.includes(stemOf(word))),
  ).sort((a, b) => b.length - a.length);
  return found[0] ?? null;
}

function needsCooling(text: string, cargo: string | null): boolean {
  const haystack = normalise(`${text} ${cargo ?? ""}`);
  return COOLING_HINTS.some((hint) => haystack.includes(hint));
}

/** Resolves "завтра до обеда" and friends into a ready/deadline pair. */
function parseWindow(text: string, now: Date): { ready: Date; deadline: Date } {
  const normalised = normalise(text);
  const ready = new Date(now);

  if (normalised.includes("послезавтра")) {
    ready.setDate(ready.getDate() + 2);
    ready.setHours(8, 0, 0, 0);
  } else if (normalised.includes("завтра")) {
    ready.setDate(ready.getDate() + 1);
    ready.setHours(8, 0, 0, 0);
  } else if (normalised.includes("сегодня")) {
    ready.setHours(Math.max(ready.getHours(), 8), 0, 0, 0);
  }

  const deadline = new Date(ready);
  if (normalised.includes("до обеда") || normalised.includes("утром") || normalised.includes("утра")) {
    deadline.setHours(12, 0, 0, 0);
  } else if (normalised.includes("вечер")) {
    deadline.setHours(20, 0, 0, 0);
  } else if (normalised.includes("срочно")) {
    deadline.setTime(ready.getTime() + 12 * 3600_000);
  } else {
    // No stated deadline: two days is a reasonable regional default, and the
    // shipper confirms it on screen before the order is placed.
    deadline.setDate(deadline.getDate() + 2);
    deadline.setHours(18, 0, 0, 0);
  }

  if (deadline <= ready) deadline.setTime(ready.getTime() + 6 * 3600_000);
  return { ready, deadline };
}

/** The offline parser. Deterministic, dictionary-driven, no network. */
export function parseWithRules(text: string, context: ParseContext): ParsedOrder {
  const tokens = tokenise(text);
  const mentions = findMentions(tokens, context.settlements);
  const { origin, destination } = resolveEndpoints(mentions);

  const cargo = parseCargo(text);
  const weight_kg = parseWeight(text);
  const { ready, deadline } = parseWindow(text, context.now);

  const warnings: string[] = [];
  if (!origin) warnings.push("Не удалось определить пункт отправления");
  if (!destination) warnings.push("Не удалось определить пункт назначения");
  if (origin && destination && origin.id === destination.id) {
    warnings.push("Отправление и назначение совпали");
  }
  if (!cargo) warnings.push("Не удалось определить груз");
  if (!weight_kg) warnings.push("Не удалось определить вес");

  return {
    origin_id: origin?.id ?? null,
    destination_id: destination && destination.id !== origin?.id ? destination.id : null,
    cargo,
    weight_kg,
    needs_cooling: needsCooling(text, cargo),
    ready_at: ready.toISOString(),
    deadline_at: deadline.toISOString(),
    parsed_by: "rules",
    warnings,
  };
}

/**
 * Builds the response schema. Settlement fields are enums over the real ids, so
 * the model physically cannot return a place outside Mangystau.
 */
function buildSchema(settlements: Settlement[]) {
  const ids = settlements.map((s) => s.id);
  return {
    type: "object",
    properties: {
      origin_id: {
        type: ["string", "null"],
        enum: [...ids, null],
        description: "Идентификатор пункта отправления или null, если он не назван",
      },
      destination_id: {
        type: ["string", "null"],
        enum: [...ids, null],
        description: "Идентификатор пункта назначения или null, если он не назван",
      },
      cargo: {
        type: ["string", "null"],
        description: "Что везут, короткой фразой на русском, например «арматура»",
      },
      weight_kg: {
        type: ["integer", "null"],
        description: "Вес в килограммах. Тонны переводить в килограммы",
      },
      needs_cooling: {
        type: "boolean",
        description: "Нужен ли рефрижератор: скоропортящийся груз, лекарства, продукты",
      },
      ready_at: {
        type: ["string", "null"],
        description: "Когда груз готов к отправке, в формате ISO 8601 с часовым поясом",
      },
      deadline_at: {
        type: ["string", "null"],
        description: "Крайний срок доставки, в формате ISO 8601 с часовым поясом",
      },
      warnings: {
        type: "array",
        items: { type: "string" },
        description: "Что осталось неясным и требует подтверждения отправителя, на русском",
      },
    },
    required: [
      "origin_id", "destination_id", "cargo", "weight_kg",
      "needs_cooling", "ready_at", "deadline_at", "warnings",
    ],
    additionalProperties: false,
  } as const;
}

function buildSystemPrompt(settlements: Settlement[], now: Date): string {
  const directory = settlements
    .map((s) => `${s.id} = ${s.name_ru}${s.name_kz && s.name_kz !== s.name_ru ? ` / ${s.name_kz}` : ""}`)
    .join("\n");

  return `Ты разбираешь заявки на грузоперевозку внутри Мангистауской области Казахстана.
Отправитель пишет обычным сообщением, как в мессенджере. Твоя задача — извлечь из него структурированную заявку.

Текущее время: ${now.toISOString()}. Относительные сроки — «завтра», «до обеда», «послезавтра» — считай от него.
Часовой пояс области: UTC+5.

Пункты отправления и назначения выбирай только из этого справочника, по идентификатору:
${directory}

Правила:
- Названия могут быть в любом падеже и на казахском или русском. «до Жанаозена» — это zhanaozen.
- Тонны переводи в килограммы.
- needs_cooling ставь true для скоропортящихся грузов, продуктов и медикаментов.
- Если чего-то в сообщении нет, ставь null и объясни это одной короткой фразой в warnings.
- Ничего не придумывай. Если пункт не из справочника, ставь null и скажи об этом в warnings.`;
}

/** The Claude path. Throws so the caller can fall back. */
export async function parseWithAi(text: string, context: ParseContext): Promise<ParsedOrder> {
  const client = new Anthropic();

  const response = await client.messages.create({
    model: "claude-opus-5",
    max_tokens: 2048,
    system: buildSystemPrompt(context.settlements, context.now),
    messages: [{ role: "user", content: text }],
    output_config: {
      // A short extraction; low effort keeps the shipper from waiting.
      effort: "low",
      format: { type: "json_schema", schema: buildSchema(context.settlements) },
    },
  });

  if (response.stop_reason === "refusal") {
    throw new Error("model declined to parse this message");
  }

  const block = response.content.find((b) => b.type === "text");
  if (!block || block.type !== "text") throw new Error("model returned no text block");

  const parsed = JSON.parse(block.text) as Omit<ParsedOrder, "parsed_by">;
  return { ...parsed, parsed_by: "ai" };
}

/**
 * Parses an order, preferring Claude and falling back to the dictionary parser.
 *
 * The fallback is not a stub: it is a second real implementation of the same
 * contract, which is why the product still works with no API key configured.
 */
export async function parseOrder(text: string, context: ParseContext): Promise<ParsedOrder> {
  if (!process.env.ANTHROPIC_API_KEY?.trim()) {
    return parseWithRules(text, context);
  }
  try {
    return await parseWithAi(text, context);
  } catch (error) {
    const fallback = parseWithRules(text, context);
    fallback.warnings.push(
      `Разбор через ИИ не удался (${error instanceof Error ? error.message : "неизвестная ошибка"}), использован разбор по словарю`,
    );
    return fallback;
  }
}
