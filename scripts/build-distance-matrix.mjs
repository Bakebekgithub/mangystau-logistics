#!/usr/bin/env node
/**
 * Builds a road distance/duration matrix between every pair of Mangystau
 * settlements using OSRM, and writes it to data/distance-matrix.json.
 *
 * This runs at build time on purpose: the live app reads the matrix from its
 * own database and never calls an external routing service. A pitch demo that
 * depends on a public demo server is a demo that can die on stage.
 *
 * Pairs OSRM cannot route (isolated hamlets with no mapped road link) fall back
 * to great-circle distance inflated by a detour factor, and are flagged so the
 * methodology page can disclose exactly which numbers are estimated.
 *
 * Run: node scripts/build-distance-matrix.mjs
 */

import { writeFile, readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(HERE, "..", "data");

const OSRM_BASE = "https://router.project-osrm.org";
/** OSRM's public demo server caps table requests; stay well under it. */
const MAX_COORDS_PER_TABLE = 90;
/**
 * Ratio of road distance to straight-line distance, used only for pairs OSRM
 * cannot route. Derived from the routable pairs in this very dataset, so it is
 * measured rather than guessed.
 */
let detourFactor = null;

function haversineKm(a, b) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

async function osrmTable(points) {
  const coords = points.map((p) => `${p.lon},${p.lat}`).join(";");
  const url = `${OSRM_BASE}/table/v1/driving/${coords}?annotations=distance,duration`;
  const res = await fetch(url);
  const text = await res.text();
  if (!text.trimStart().startsWith("{")) {
    throw new Error(`OSRM returned non-JSON (${res.status})`);
  }
  const json = JSON.parse(text);
  if (json.code !== "Ok") throw new Error(`OSRM: ${json.code} ${json.message ?? ""}`);
  return json;
}

async function main() {
  const { settlements } = JSON.parse(
    await readFile(join(DATA_DIR, "settlements.json"), "utf8"),
  );
  console.log(`Building road matrix for ${settlements.length} settlements…`);

  if (settlements.length > MAX_COORDS_PER_TABLE) {
    throw new Error(
      `${settlements.length} settlements exceeds the ${MAX_COORDS_PER_TABLE}-coordinate ` +
        `table limit; the matrix would need chunking.`,
    );
  }

  const table = await osrmTable(settlements);
  console.log("  OSRM table received");

  const pairs = [];
  let routable = 0;
  let estimated = 0;
  let ratioSum = 0;
  let ratioCount = 0;

  // First pass: collect routable pairs and measure the real detour factor.
  for (let i = 0; i < settlements.length; i++) {
    for (let j = 0; j < settlements.length; j++) {
      if (i === j) continue;
      const metres = table.distances?.[i]?.[j];
      if (metres == null) continue;
      const straight = haversineKm(settlements[i], settlements[j]);
      if (straight > 1) {
        ratioSum += metres / 1000 / straight;
        ratioCount++;
      }
    }
  }
  detourFactor = ratioCount > 0 ? ratioSum / ratioCount : 1.35;
  console.log(`  measured detour factor: ${detourFactor.toFixed(3)} (from ${ratioCount} routable pairs)`);

  for (let i = 0; i < settlements.length; i++) {
    for (let j = i + 1; j < settlements.length; j++) {
      const from = settlements[i];
      const to = settlements[j];
      const metres = table.distances?.[i]?.[j];
      const seconds = table.durations?.[i]?.[j];

      if (metres != null && seconds != null) {
        pairs.push({
          from: from.id,
          to: to.id,
          km: Math.round((metres / 1000) * 10) / 10,
          minutes: Math.round(seconds / 60),
          source: "osrm",
        });
        routable++;
      } else {
        const straight = haversineKm(from, to);
        const km = Math.round(straight * detourFactor * 10) / 10;
        pairs.push({
          from: from.id,
          to: to.id,
          km,
          // 60 km/h average on regional roads, used only for estimated pairs.
          minutes: Math.round((km / 60) * 60),
          source: "estimated",
        });
        estimated++;
      }
    }
  }

  const payload = {
    source: "OSRM (OpenStreetMap road network)",
    generated_note:
      "Road distances from OSRM. Pairs OSRM could not route use great-circle " +
      "distance multiplied by the detour factor measured from routable pairs.",
    detour_factor: Math.round(detourFactor * 1000) / 1000,
    settlement_count: settlements.length,
    pair_count: pairs.length,
    routable_pairs: routable,
    estimated_pairs: estimated,
    pairs,
  };

  await writeFile(join(DATA_DIR, "distance-matrix.json"), JSON.stringify(payload, null, 2));

  console.log(`\nWrote ${pairs.length} pairs to data/distance-matrix.json`);
  console.log(`  by road (OSRM): ${routable}`);
  console.log(`  estimated:      ${estimated}`);

  const byId = Object.fromEntries(settlements.map((s) => [s.id, s]));
  const show = (a, b) => {
    const p = pairs.find(
      (x) => (x.from === a && x.to === b) || (x.from === b && x.to === a),
    );
    if (p) {
      console.log(
        `    ${byId[a].name_ru} → ${byId[b].name_ru}: ${p.km} км, ${p.minutes} мин (${p.source})`,
      );
    }
  };
  console.log("\n  проверка:");
  show("aktau", "zhanaozen");
  show("aktau", "beyneu");
  show("aktau", "shetpe");
  show("aktau", "fort-shevchenko");
  show("zhanaozen", "zhetybay");
}

main().catch((err) => {
  console.error("\nFAILED:", err.message);
  process.exit(1);
});
