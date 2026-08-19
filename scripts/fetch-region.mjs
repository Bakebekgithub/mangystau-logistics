#!/usr/bin/env node
/**
 * Fetches the outline of Mangystau Region (OSM relation 215686) and writes a
 * simplified polygon to data/region.json.
 *
 * The map draws this outline itself rather than loading raster tiles from a
 * third-party server. That keeps the whole demo free of external runtime
 * dependencies — a tile server that is slow or blocked at the venue cannot break
 * the presentation — and the boundary is still real OSM data.
 *
 * Run: node scripts/fetch-region.mjs
 */

import { writeFile, readFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(HERE, "..", "data");
const CACHE = join(DATA_DIR, "source", "osm_region_raw.json");

const OSM_RELATION = 215686;

/**
 * The official OSM API is the primary source here rather than Overpass: Overpass
 * mirrors are frequently overloaded, while this endpoint returns the relation and
 * every member way and node in one small response.
 */
const OSM_API = `https://api.openstreetmap.org/api/0.6/relation/${OSM_RELATION}/full.json`;

async function fetchFromOsm() {
  const res = await fetch(OSM_API, { redirect: "follow" });
  const text = await res.text();
  if (!text.trimStart().startsWith("{")) {
    throw new Error(`OSM API returned non-JSON (HTTP ${res.status})`);
  }
  const json = JSON.parse(text);
  if (!json.elements?.length) throw new Error("OSM API returned zero elements");
  console.log(`  fetched from ${OSM_API}`);
  return json;
}

async function cached() {
  try {
    const value = JSON.parse(await readFile(CACHE, "utf8"));
    console.log("  using cached response");
    return value;
  } catch {
    const fresh = await fetchFromOsm();
    await mkdir(dirname(CACHE), { recursive: true });
    await writeFile(CACHE, JSON.stringify(fresh));
    return fresh;
  }
}

/**
 * Stitches the relation's outer ways into closed rings.
 *
 * The OSM API returns ways as lists of node ids, so coordinates are resolved from
 * the node elements first. Member ways come in arbitrary order and direction, so
 * each ring is grown by repeatedly attaching whichever remaining way shares an
 * endpoint with it.
 */
function buildRings(elements) {
  const relation = elements.find((el) => el.type === "relation");
  if (!relation?.members) throw new Error("relation missing from response");

  const nodeById = new Map(
    elements.filter((el) => el.type === "node").map((el) => [el.id, [el.lon, el.lat]]),
  );
  const wayById = new Map(elements.filter((el) => el.type === "way").map((el) => [el.id, el]));

  const outerWayIds = relation.members
    .filter((m) => m.type === "way" && (m.role === "outer" || m.role === ""))
    .map((m) => m.ref);

  const ways = [];
  for (const id of outerWayIds) {
    const way = wayById.get(id);
    if (!way?.nodes) continue;
    const line = way.nodes.map((ref) => nodeById.get(ref)).filter(Boolean);
    if (line.length >= 2) ways.push(line);
  }
  if (ways.length === 0) throw new Error("no outer ways with resolvable geometry");

  const rings = [];
  const remaining = [...ways];

  while (remaining.length > 0) {
    let ring = remaining.shift();

    let extended = true;
    while (extended) {
      extended = false;
      const head = ring[0];
      const tail = ring[ring.length - 1];

      for (let i = 0; i < remaining.length; i++) {
        const candidate = remaining[i];
        const cHead = candidate[0];
        const cTail = candidate[candidate.length - 1];
        const same = (a, b) => Math.abs(a[0] - b[0]) < 1e-7 && Math.abs(a[1] - b[1]) < 1e-7;

        if (same(tail, cHead)) ring = ring.concat(candidate.slice(1));
        else if (same(tail, cTail)) ring = ring.concat([...candidate].reverse().slice(1));
        else if (same(head, cTail)) ring = candidate.slice(0, -1).concat(ring);
        else if (same(head, cHead)) ring = [...candidate].reverse().slice(0, -1).concat(ring);
        else continue;

        remaining.splice(i, 1);
        extended = true;
        break;
      }
    }

    if (ring.length >= 4) rings.push(ring);
  }

  return rings.sort((a, b) => b.length - a.length);
}

/**
 * Ramer–Douglas–Peucker simplification. The full boundary is tens of thousands
 * of points; the map needs a shape, not a survey.
 */
function simplify(points, tolerance) {
  if (points.length <= 2) return points;

  const distance = (p, a, b) => {
    const [x, y] = p;
    const [x1, y1] = a;
    const [x2, y2] = b;
    const dx = x2 - x1;
    const dy = y2 - y1;
    if (dx === 0 && dy === 0) return Math.hypot(x - x1, y - y1);
    const t = ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy);
    const clamped = Math.min(1, Math.max(0, t));
    return Math.hypot(x - (x1 + clamped * dx), y - (y1 + clamped * dy));
  };

  let worst = 0;
  let index = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const d = distance(points[i], points[0], points[points.length - 1]);
    if (d > worst) {
      worst = d;
      index = i;
    }
  }

  if (worst <= tolerance) return [points[0], points[points.length - 1]];
  return [
    ...simplify(points.slice(0, index + 1), tolerance).slice(0, -1),
    ...simplify(points.slice(index), tolerance),
  ];
}

async function main() {
  console.log("Fetching Mangystau region outline from OpenStreetMap…");
  const raw = await cached();

  const relation = raw.elements.find((el) => el.type === "relation");
  const rings = buildRings(raw.elements);
  if (rings.length === 0) throw new Error("could not stitch any closed ring");

  // ~0.01° ≈ 1 km here, fine for a region 500 km across.
  const TOLERANCE = 0.01;
  const simplified = rings
    .map((ring) => simplify(ring, TOLERANCE))
    .filter((ring) => ring.length >= 4);

  const pointsBefore = rings.reduce((sum, r) => sum + r.length, 0);
  const pointsAfter = simplified.reduce((sum, r) => sum + r.length, 0);

  const payload = {
    type: "Feature",
    properties: {
      name_ru: relation.tags?.["name:ru"] ?? "Мангистауская область",
      name_kz: relation.tags?.name ?? "Маңғыстау облысы",
      source: "OpenStreetMap relation 215686, ODbL 1.0",
      simplified_tolerance_deg: TOLERANCE,
    },
    geometry: {
      type: "MultiPolygon",
      coordinates: simplified.map((ring) => [ring]),
    },
  };

  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(join(DATA_DIR, "region.json"), JSON.stringify(payload));

  console.log(`\nWrote data/region.json`);
  console.log(`  rings: ${simplified.length}`);
  console.log(`  points: ${pointsBefore} → ${pointsAfter}`);
}

main().catch((err) => {
  console.error("\nFAILED:", err.message);
  process.exit(1);
});
