#!/usr/bin/env node
/**
 * Fetches the settlements of Mangystau Region (Маңғыстау облысы) from
 * OpenStreetMap and writes a clean, reviewed dataset to data/settlements.json.
 *
 * Region is OSM relation 215686 (admin_level=4). Overpass turns that into an
 * area id by adding 3600000000.
 *
 * Every settlement keeps its Kazakh and Russian names because the product is
 * bilingual and dispatchers type either one.
 *
 * Run: node scripts/fetch-settlements.mjs
 */

import { writeFile, readFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(HERE, "..", "data");
const CACHE = join(DATA_DIR, "source", "osm_settlements_raw.json");

const OSM_REGION_RELATION = 215686;
const OSM_AREA_ID = 3600000000 + OSM_REGION_RELATION;

const ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.osm.ch/api/interpreter",
];

const QUERY = `[out:json][timeout:180];
area(${OSM_AREA_ID})->.mangystau;
node["place"~"^(city|town|village|hamlet)$"](area.mangystau);
out tags center;`;

/** Overpass answers with HTML on overload, so validate before trusting it. */
async function overpass() {
  const errors = [];
  for (const endpoint of ENDPOINTS) {
    try {
      const res = await fetch(endpoint, { method: "POST", body: QUERY });
      const text = await res.text();
      if (!text.trimStart().startsWith("{")) {
        errors.push(`${endpoint}: non-JSON response (likely overloaded)`);
        continue;
      }
      const json = JSON.parse(text);
      if (!Array.isArray(json.elements) || json.elements.length === 0) {
        errors.push(`${endpoint}: zero elements`);
        continue;
      }
      console.log(`  fetched from ${endpoint}`);
      return json;
    } catch (err) {
      errors.push(`${endpoint}: ${err.message}`);
    }
  }
  throw new Error(`all Overpass endpoints failed:\n  ${errors.join("\n  ")}`);
}

async function cachedOverpass() {
  try {
    const cached = JSON.parse(await readFile(CACHE, "utf8"));
    console.log("  using cached Overpass response");
    return cached;
  } catch {
    const fresh = await overpass();
    await mkdir(dirname(CACHE), { recursive: true });
    await writeFile(CACHE, JSON.stringify(fresh, null, 2));
    return fresh;
  }
}

/** Stable slug so seed data can reference settlements by a readable id. */
function slugify(name) {
  const map = {
    а: "a", б: "b", в: "v", г: "g", ғ: "g", д: "d", е: "e", ё: "e", ж: "zh",
    з: "z", и: "i", й: "y", к: "k", қ: "q", л: "l", м: "m", н: "n", ң: "ng",
    о: "o", ө: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ұ: "u", ү: "u",
    ф: "f", х: "h", һ: "h", ц: "c", ч: "ch", ш: "sh", щ: "sch", ъ: "", ы: "y",
    і: "i", ь: "", э: "e", ю: "yu", я: "ya",
  };
  return name
    .toLowerCase()
    .split("")
    .map((ch) => (ch in map ? map[ch] : ch))
    .join("")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function toPopulation(tags) {
  const raw = tags.population;
  if (!raw) return null;
  const n = Number.parseInt(String(raw).replace(/[^0-9]/g, ""), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

async function main() {
  console.log("Fetching Mangystau settlements from OpenStreetMap…");
  const raw = await cachedOverpass();

  const settlements = raw.elements
    // Unnamed nodes cannot appear in a dispatcher UI, so they are dropped.
    .filter((el) => el.tags?.name)
    .map((el) => ({
      id: slugify(el.tags["name:ru"] || el.tags.name),
      osm_id: el.id,
      name_kz: el.tags["name:kk"] || el.tags.name,
      name_ru: el.tags["name:ru"] || el.tags.name,
      name_en: el.tags["name:en"] || null,
      place: el.tags.place,
      population: toPopulation(el.tags),
      lat: el.lat ?? el.center?.lat,
      lon: el.lon ?? el.center?.lon,
    }))
    .filter((s) => Number.isFinite(s.lat) && Number.isFinite(s.lon));

  // Duplicate slugs would silently collide in seed data and the distance matrix.
  const seen = new Map();
  for (const s of settlements) {
    const count = (seen.get(s.id) ?? 0) + 1;
    seen.set(s.id, count);
    if (count > 1) s.id = `${s.id}-${count}`;
  }

  settlements.sort((a, b) => (b.population ?? 0) - (a.population ?? 0));

  const payload = {
    source: "OpenStreetMap via Overpass API",
    license: "ODbL 1.0",
    region: { name_kz: "Маңғыстау облысы", name_ru: "Мангистауская область", osm_relation: OSM_REGION_RELATION },
    fetched_from_cache: true,
    osm_timestamp: raw.osm3s?.timestamp_osm_base ?? null,
    count: settlements.length,
    settlements,
  };

  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(join(DATA_DIR, "settlements.json"), JSON.stringify(payload, null, 2));

  const byPlace = settlements.reduce((acc, s) => {
    acc[s.place] = (acc[s.place] ?? 0) + 1;
    return acc;
  }, {});

  console.log(`\nWrote ${settlements.length} settlements to data/settlements.json`);
  console.log("  by place type:", byPlace);
  console.log(`  with population: ${settlements.filter((s) => s.population).length}`);
  console.log("\n  largest:");
  for (const s of settlements.slice(0, 8)) {
    console.log(`    ${s.name_ru.padEnd(16)} ${String(s.population ?? "—").padStart(7)}  ${s.place}`);
  }
}

main().catch((err) => {
  console.error("\nFAILED:", err.message);
  process.exit(1);
});
