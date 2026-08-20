/**
 * Read queries for the screens.
 *
 * Every shape returned here is what a screen actually renders, joins included,
 * so components never assemble data across several round trips.
 */

import { getDb } from "./db.ts";
import { ASSUMPTIONS } from "./engine/economics.ts";
import type { OrderStatus, PlaceKind, StopAction, VehicleKind } from "./types.ts";

export interface OrderView {
  id: string;
  shipper_name: string;
  origin_id: string;
  origin_name: string;
  destination_id: string;
  destination_name: string;
  destination_place: PlaceKind;
  cargo: string;
  weight_kg: number;
  needs_cooling: boolean;
  ready_at: string;
  deadline_at: string;
  /** What the shipper offers, and any counter from a carrier. */
  offered_price_kzt: number | null;
  counter_price_kzt: number | null;
  price_status: "offered" | "countered" | "agreed";
  status: OrderStatus;
  raw_text: string | null;
  parsed_by: string | null;
  km: number | null;
  /** Who is carrying it, once a driver has taken the trip. */
  carrier_name?: string | null;
  carrier_plate?: string | null;
  /** So the shipper can ring the driver rather than wait to be rung. */
  carrier_phone?: string | null;
  trip_id?: string | null;
  /** Status of the trip this order sits in, including a not-yet-accepted one. */
  trip_status?: string | null;
}

/**
 * Joins the carrier onto an order, for the shipper's "who is carrying my cargo"
 * question. Written once and reused by both order queries.
 */
const CARRIER_JOIN = `
  LEFT JOIN LATERAL (
    SELECT c.name AS carrier_name, v.plate AS carrier_plate, c.phone AS carrier_phone,
           tr.id AS trip_id, tr.status AS trip_status
    FROM trip_stops ts
    JOIN trips tr ON tr.id = ts.trip_id AND tr.status <> 'declined'
    JOIN vehicles v ON v.id = tr.vehicle_id
    JOIN carriers c ON c.id = v.carrier_id
    WHERE ts.order_id = o.id
    -- An accepted trip outranks a merely proposed one.
    ORDER BY CASE tr.status WHEN 'proposed' THEN 1 ELSE 0 END
    LIMIT 1
  ) carrier ON true`;

export async function listOrders(status?: OrderStatus, limit = 200): Promise<OrderView[]> {
  const db = getDb();
  const rows = await db.query<OrderView>(
    `SELECT o.id, o.shipper_name,
            o.origin_id, so.name_ru AS origin_name,
            o.destination_id, sd.name_ru AS destination_name, sd.place AS destination_place,
            o.cargo, o.weight_kg, o.needs_cooling, o.ready_at, o.deadline_at,
            o.offered_price_kzt, o.counter_price_kzt, o.price_status,
            o.status, o.raw_text, o.parsed_by,
            d.km
     FROM orders o
     JOIN settlements so ON so.id = o.origin_id
     JOIN settlements sd ON sd.id = o.destination_id
     LEFT JOIN distances d ON d.from_id = o.origin_id AND d.to_id = o.destination_id
     ${status ? "WHERE o.status = $1" : ""}
     ORDER BY o.created_at DESC
     LIMIT ${limit}`,
    status ? [status] : [],
  );
  return rows.map(numberiseOrder);
}

/**
 * Orders that arrived as a typed message rather than from the demand generator.
 *
 * This is what the shipper screen shows as "my orders": the ones a person
 * actually created in this session, kept apart from the modelled regional flow.
 */
export async function listTypedOrders(limit = 25): Promise<OrderView[]> {
  const db = getDb();
  const rows = await db.query<OrderView>(
    `SELECT o.id, o.shipper_name,
            o.origin_id, so.name_ru AS origin_name,
            o.destination_id, sd.name_ru AS destination_name, sd.place AS destination_place,
            o.cargo, o.weight_kg, o.needs_cooling, o.ready_at, o.deadline_at,
            o.offered_price_kzt, o.counter_price_kzt, o.price_status,
            o.status, o.raw_text, o.parsed_by,
            d.km,
            carrier.carrier_name, carrier.carrier_plate, carrier.carrier_phone,
            carrier.trip_id, carrier.trip_status
     FROM orders o
     JOIN settlements so ON so.id = o.origin_id
     JOIN settlements sd ON sd.id = o.destination_id
     LEFT JOIN distances d ON d.from_id = o.origin_id AND d.to_id = o.destination_id
     ${CARRIER_JOIN}
     WHERE o.raw_text IS NOT NULL
     ORDER BY o.created_at DESC
     LIMIT ${limit}`,
  );
  return rows.map(numberiseOrder);
}

/**
 * Orders in the pool that no proposal has picked up yet.
 *
 * Shown at the top of the carrier screen so a just-placed order is visibly
 * waiting rather than silently absent until someone re-runs planning.
 */
export async function listUnplannedOrders(): Promise<OrderView[]> {
  const db = getDb();
  const rows = await db.query<OrderView>(
    `SELECT o.id, o.shipper_name,
            o.origin_id, so.name_ru AS origin_name,
            o.destination_id, sd.name_ru AS destination_name, sd.place AS destination_place,
            o.cargo, o.weight_kg, o.needs_cooling, o.ready_at, o.deadline_at,
            o.offered_price_kzt, o.counter_price_kzt, o.price_status,
            o.status, o.raw_text, o.parsed_by,
            d.km
     FROM orders o
     JOIN settlements so ON so.id = o.origin_id
     JOIN settlements sd ON sd.id = o.destination_id
     LEFT JOIN distances d ON d.from_id = o.origin_id AND d.to_id = o.destination_id
     WHERE o.status = 'new'
       AND NOT EXISTS (
         SELECT 1 FROM trip_stops ts
         JOIN trips t ON t.id = ts.trip_id AND t.status <> 'declined'
         WHERE ts.order_id = o.id
       )
     ORDER BY o.created_at DESC
     LIMIT 12`,
  );
  return rows.map(numberiseOrder);
}

/** Postgres returns numerics as strings; screens expect numbers. */
function numberiseOrder(row: OrderView): OrderView {
  return {
    ...row,
    weight_kg: Number(row.weight_kg),
    km: row.km === null ? null : Number(row.km),
    offered_price_kzt: row.offered_price_kzt === null ? null : Number(row.offered_price_kzt),
    counter_price_kzt: row.counter_price_kzt === null ? null : Number(row.counter_price_kzt),
  };
}

export interface TripStopView {
  id: string;
  seq: number;
  settlement_id: string;
  settlement_name: string;
  lat: number;
  lon: number;
  action: StopAction;
  order_id: string | null;
  cargo: string | null;
  weight_kg: number | null;
  shipper_name: string | null;
  /** The number the driver calls before setting off. */
  shipper_phone: string | null;
  /** Price attached to this consignment, so the driver sees what each leg pays. */
  offered_price_kzt: number | null;
  counter_price_kzt: number | null;
  price_status: "offered" | "countered" | "agreed" | null;
  done_at: string | null;
  /** Placed by a person rather than the demand generator. */
  is_typed: boolean;
}

export interface TripView {
  id: string;
  status: "proposed" | "accepted" | "in_transit" | "completed" | "declined";
  kind: "backhaul" | "consolidation" | "backhaul+consolidation" | "single";
  vehicle_id: string;
  plate: string;
  vehicle_kind: VehicleKind;
  capacity_kg: number;
  carrier_name: string;
  at_name: string;
  total_km: number;
  laden_km: number;
  empty_km: number;
  baseline_total_km: number;
  baseline_empty_km: number;
  fuel_l: number;
  fuel_saved_l: number;
  money_saved_kzt: number;
  paid_km_share: number;
  minutes: number;
  explanation: string;
  /**
   * What this trip pays: the sum of what the shippers aboard offered. Real
   * money from real offers — the engine puts no tariff on anything.
   */
  revenue_kzt: number;
  accepted_at: string | null;
  at_lat: number;
  at_lon: number;
  /**
   * Whether this trip carries an order somebody typed in, as opposed to one from
   * the demand generator. Those go to the top of the carrier's list so a person
   * who just placed an order can immediately see it picked up.
   */
  has_typed_order: boolean;
  stops: TripStopView[];
}

export async function listTrips(status?: TripView["status"]): Promise<TripView[]> {
  const db = getDb();

  const trips = await db.query<Omit<TripView, "stops">>(
    `SELECT t.id, t.status, t.kind, t.vehicle_id, v.plate, v.kind AS vehicle_kind, v.capacity_kg,
            c.name AS carrier_name, s.name_ru AS at_name, s.lat AS at_lat, s.lon AS at_lon,
            t.total_km, t.laden_km, t.empty_km, t.baseline_total_km, t.baseline_empty_km,
            t.fuel_l, t.fuel_saved_l, t.money_saved_kzt, t.paid_km_share, t.minutes,
            t.explanation, t.accepted_at,
            COALESCE((
              SELECT sum(o.offered_price_kzt)
              FROM trip_stops ts
              JOIN orders o ON o.id = ts.order_id
              WHERE ts.trip_id = t.id AND ts.action = 'pickup'
            ), 0) AS revenue_kzt,
            EXISTS (
              SELECT 1 FROM trip_stops ts
              JOIN orders o ON o.id = ts.order_id
              WHERE ts.trip_id = t.id AND o.raw_text IS NOT NULL
            ) AS has_typed_order
     FROM trips t
     JOIN vehicles v ON v.id = t.vehicle_id
     JOIN carriers c ON c.id = v.carrier_id
     JOIN settlements s ON s.id = v.at_id
     ${status ? "WHERE t.status = $1" : ""}
     -- Trips carrying a hand-typed order first: that is the one the person in
     -- front of the screen is waiting to see picked up.
     ORDER BY has_typed_order DESC, (t.baseline_total_km - t.total_km) DESC`,
    status ? [status] : [],
  );
  if (trips.length === 0) return [];

  const stops = await db.query<TripStopView & { trip_id: string }>(
    `SELECT ts.id, ts.trip_id, ts.seq, ts.settlement_id, s.name_ru AS settlement_name,
            s.lat, s.lon, ts.action, ts.order_id, o.cargo, o.weight_kg,
            o.shipper_name, o.shipper_phone,
            o.offered_price_kzt, o.counter_price_kzt, o.price_status, ts.done_at,
            (o.raw_text IS NOT NULL) AS is_typed
     FROM trip_stops ts
     JOIN settlements s ON s.id = ts.settlement_id
     LEFT JOIN orders o ON o.id = ts.order_id
     WHERE ts.trip_id = ANY($1::text[])
     ORDER BY ts.trip_id, ts.seq`,
    [trips.map((t) => t.id)],
  );

  const byTrip = new Map<string, TripStopView[]>();
  for (const stop of stops) {
    const { trip_id, ...rest } = stop;
    const list = byTrip.get(trip_id) ?? [];
    list.push({
      ...rest,
      lat: Number(rest.lat),
      lon: Number(rest.lon),
      weight_kg: rest.weight_kg === null ? null : Number(rest.weight_kg),
    });
    byTrip.set(trip_id, list);
  }

  return trips.map((t) => ({
    ...t,
    total_km: Number(t.total_km),
    laden_km: Number(t.laden_km),
    empty_km: Number(t.empty_km),
    baseline_total_km: Number(t.baseline_total_km),
    baseline_empty_km: Number(t.baseline_empty_km),
    fuel_l: Number(t.fuel_l),
    fuel_saved_l: Number(t.fuel_saved_l),
    money_saved_kzt: Number(t.money_saved_kzt),
    paid_km_share: Number(t.paid_km_share),
    capacity_kg: Number(t.capacity_kg),
    at_lat: Number(t.at_lat),
    at_lon: Number(t.at_lon),
    stops: byTrip.get(t.id) ?? [],
  }));
}

export interface FlowLine {
  from_id: string;
  to_id: string;
  from_name: string;
  to_name: string;
  from_lat: number;
  from_lon: number;
  to_lat: number;
  to_lon: number;
  shipments: number;
  tonnes: number;
}

/**
 * Aggregated freight flow between settlements, for the regional map. Direction
 * is normalised so a corridor is one line rather than two overlapping ones.
 */
export async function listFlows(): Promise<FlowLine[]> {
  const db = getDb();
  const rows = await db.query<FlowLine>(
    `WITH pairs AS (
       SELECT least(origin_id, destination_id) AS a,
              greatest(origin_id, destination_id) AS b,
              weight_kg
       FROM orders
     )
     SELECT p.a AS from_id, p.b AS to_id,
            sa.name_ru AS from_name, sb.name_ru AS to_name,
            sa.lat AS from_lat, sa.lon AS from_lon,
            sb.lat AS to_lat, sb.lon AS to_lon,
            count(*) AS shipments,
            round(sum(p.weight_kg) / 1000.0, 1) AS tonnes
     FROM pairs p
     JOIN settlements sa ON sa.id = p.a
     JOIN settlements sb ON sb.id = p.b
     GROUP BY 1,2,3,4,5,6,7,8
     ORDER BY shipments DESC, tonnes DESC`,
  );
  return rows.map((r) => ({
    ...r,
    from_lat: Number(r.from_lat),
    from_lon: Number(r.from_lon),
    to_lat: Number(r.to_lat),
    to_lon: Number(r.to_lon),
    shipments: Number(r.shipments),
    tonnes: Number(r.tonnes),
  }));
}

export interface Analytics {
  orders_total: number;
  orders_pending: number;
  orders_covered: number;
  trips: number;
  /** Metric 1: pure arithmetic over the planned routes. */
  paid_km_share: number;
  paid_km_ceiling_without_pairing: number;
  planned_km: number;
  planned_empty_km: number;
  /** Metric 2: against the region's own reported empty-running share. */
  payload_km: number;
  today_km: number;
  km_avoided: number;
  fuel_saved_l: number;
  money_saved_kzt: number;
  /** Metric 3: upper bound, one dedicated run per order. */
  dedicated_km: number;
  /** Access: small consignments to remote places that got served. */
  small_remote_served: number;
  top_empty_corridors: { corridor: string; shipments: number }[];
}

/**
 * The akimat view.
 *
 * Deliberately reports three baselines rather than one headline. The strongest
 * claim needs no counterfactual at all: a truck delivering one load and coming
 * back empty cannot exceed a 50% paid-kilometre share, so anything above that is
 * arithmetic rather than argument.
 */
export async function analytics(): Promise<Analytics> {
  const db = getDb();

  const [totals] = await db.query<{
    orders_total: string;
    orders_pending: string;
  }>(
    `SELECT count(*) AS orders_total,
            count(*) FILTER (WHERE status = 'new') AS orders_pending
     FROM orders`,
  );

  const [planned] = await db.query<{
    trips: string;
    planned_km: string | null;
    laden_km: string | null;
    planned_empty_km: string | null;
    dedicated_km: string | null;
    fuel_saved_l: string | null;
    money_saved_kzt: string | null;
  }>(
    `SELECT count(*) AS trips,
            sum(total_km) AS planned_km,
            sum(laden_km) AS laden_km,
            sum(empty_km) AS planned_empty_km,
            sum(baseline_total_km) AS dedicated_km,
            sum(fuel_saved_l) AS fuel_saved_l,
            sum(money_saved_kzt) AS money_saved_kzt
     FROM trips
     WHERE status <> 'declined'`,
  );

  const [covered] = await db.query<{ orders_covered: string; payload_km: string | null }>(
    // One dropoff per order, so summing the direct origin→destination distance
    // over dropoff stops gives the irreducible transport work.
    `SELECT count(DISTINCT ts.order_id) AS orders_covered,
            sum(leg.km) AS payload_km
     FROM trip_stops ts
     JOIN trips t ON t.id = ts.trip_id AND t.status <> 'declined'
     JOIN orders o ON o.id = ts.order_id
     JOIN distances leg ON leg.from_id = o.origin_id AND leg.to_id = o.destination_id
     WHERE ts.action = 'dropoff'`,
  );

  const [small] = await db.query<{ n: string }>(
    `SELECT count(DISTINCT o.id) AS n
     FROM trip_stops ts
     JOIN trips t ON t.id = ts.trip_id AND t.status <> 'declined'
     JOIN orders o ON o.id = ts.order_id
     JOIN settlements sd ON sd.id = o.destination_id
     JOIN distances d ON d.from_id = o.origin_id AND d.to_id = o.destination_id
     WHERE o.weight_kg < 1000 AND d.km > 100 AND sd.place IN ('village', 'hamlet')`,
  );

  const corridors = await db.query<{ corridor: string; shipments: string }>(
    `SELECT sa.name_ru || ' → ' || sb.name_ru AS corridor, count(*) AS shipments
     FROM orders o
     JOIN settlements sa ON sa.id = o.origin_id
     JOIN settlements sb ON sb.id = o.destination_id
     GROUP BY 1 ORDER BY 2 DESC LIMIT 5`,
  );

  const planned_km = num(planned?.planned_km);
  const laden_km = num(planned?.laden_km);
  const payload_km = num(covered?.payload_km);
  const today_km = payload_km / (1 - ASSUMPTIONS.regionalEmptyShareToday);

  return {
    orders_total: Number(totals?.orders_total ?? 0),
    orders_pending: Number(totals?.orders_pending ?? 0),
    orders_covered: Number(covered?.orders_covered ?? 0),
    trips: Number(planned?.trips ?? 0),
    paid_km_share: planned_km > 0 ? round3(laden_km / planned_km) : 0,
    paid_km_ceiling_without_pairing: 0.5,
    planned_km: round1(planned_km),
    planned_empty_km: round1(num(planned?.planned_empty_km)),
    payload_km: round1(payload_km),
    today_km: round1(today_km),
    km_avoided: round1(Math.max(0, today_km - planned_km)),
    fuel_saved_l: round1(num(planned?.fuel_saved_l)),
    money_saved_kzt: Math.round(num(planned?.money_saved_kzt)),
    dedicated_km: round1(num(planned?.dedicated_km)),
    small_remote_served: Number(small?.n ?? 0),
    top_empty_corridors: corridors.map((c) => ({ corridor: c.corridor, shipments: Number(c.shipments) })),
  };
}

export async function listSettlements() {
  const db = getDb();
  const rows = await db.query<{
    id: string; name_ru: string; name_kz: string; place: PlaceKind; population: number | null; lat: number; lon: number;
  }>(`SELECT id, name_ru, name_kz, place, population, lat, lon FROM settlements ORDER BY population DESC NULLS LAST`);
  return rows.map((r) => ({ ...r, lat: Number(r.lat), lon: Number(r.lon), population: r.population === null ? null : Number(r.population) }));
}

function num(value: string | null | undefined): number {
  return value === null || value === undefined ? 0 : Number(value);
}

function round1(x: number): number {
  return Math.round(x * 10) / 10;
}

function round3(x: number): number {
  return Math.round(x * 1000) / 1000;
}
