-- Mangystau Logistics schema.
--
-- Runs unchanged on PGlite locally and on Neon in production, because PGlite is
-- real Postgres. Written to be re-runnable: seeding drops and rebuilds.

DROP TABLE IF EXISTS trip_stops;
DROP TABLE IF EXISTS trips;
DROP TABLE IF EXISTS orders;
DROP TABLE IF EXISTS vehicles;
DROP TABLE IF EXISTS carriers;
DROP TABLE IF EXISTS distances;
DROP TABLE IF EXISTS settlements;

-- ---------------------------------------------------------------------------
-- Reference data: real, from OpenStreetMap and OSRM.
-- ---------------------------------------------------------------------------

CREATE TABLE settlements (
  id          text PRIMARY KEY,
  osm_id      bigint,
  name_kz     text NOT NULL,
  name_ru     text NOT NULL,
  place       text NOT NULL CHECK (place IN ('city', 'town', 'village', 'hamlet')),
  population  integer,
  lat         double precision NOT NULL,
  lon         double precision NOT NULL
);

-- Directed pairs, so a future asymmetric matrix needs no migration.
CREATE TABLE distances (
  from_id  text NOT NULL REFERENCES settlements(id),
  to_id    text NOT NULL REFERENCES settlements(id),
  km       numeric(7, 1) NOT NULL,
  minutes  integer NOT NULL,
  source   text NOT NULL CHECK (source IN ('osrm', 'estimated')),
  PRIMARY KEY (from_id, to_id)
);

CREATE INDEX distances_from_idx ON distances (from_id);

-- ---------------------------------------------------------------------------
-- Operational data: modelled demand and supply.
-- ---------------------------------------------------------------------------

CREATE TABLE carriers (
  id         text PRIMARY KEY,
  name       text NOT NULL,
  phone      text,
  base_id    text NOT NULL REFERENCES settlements(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE vehicles (
  id             text PRIMARY KEY,
  carrier_id     text NOT NULL REFERENCES carriers(id),
  plate          text NOT NULL,
  kind           text NOT NULL CHECK (kind IN ('tent', 'refrigerator', 'flatbed', 'tipper')),
  capacity_kg    integer NOT NULL CHECK (capacity_kg > 0),
  -- Litres per 100 km when running empty; laden consumption is derived in
  -- lib/engine/economics.ts from a documented surcharge.
  fuel_per_100km numeric(5, 1) NOT NULL,
  at_id          text NOT NULL REFERENCES settlements(id)
);

CREATE INDEX vehicles_at_idx ON vehicles (at_id);

CREATE TABLE orders (
  id             text PRIMARY KEY,
  shipper_name   text NOT NULL,
  origin_id      text NOT NULL REFERENCES settlements(id),
  destination_id text NOT NULL REFERENCES settlements(id),
  cargo          text NOT NULL,
  weight_kg      integer NOT NULL CHECK (weight_kg > 0),
  needs_cooling  boolean NOT NULL DEFAULT false,
  ready_at       timestamptz NOT NULL,
  deadline_at    timestamptz NOT NULL,
  status         text NOT NULL DEFAULT 'new'
                 CHECK (status IN ('new', 'matched', 'in_transit', 'delivered', 'expired')),
  -- The message the shipper actually typed, kept so the parse can be shown and
  -- audited on screen. This is the channel the brief calls out as the problem.
  raw_text       text,
  parsed_by      text CHECK (parsed_by IN ('ai', 'rules', 'seed')),
  created_at     timestamptz NOT NULL DEFAULT now(),
  CHECK (origin_id <> destination_id),
  CHECK (deadline_at >= ready_at)
);

CREATE INDEX orders_status_idx ON orders (status);
CREATE INDEX orders_origin_idx ON orders (origin_id);

CREATE TABLE trips (
  id           text PRIMARY KEY,
  vehicle_id   text NOT NULL REFERENCES vehicles(id),
  status       text NOT NULL DEFAULT 'proposed'
               CHECK (status IN ('proposed', 'accepted', 'in_transit', 'completed', 'declined')),
  -- Which story this trip tells, decided by the engine. Stored rather than
  -- re-derived so the driver's card and the analytics agree.
  kind         text NOT NULL
               CHECK (kind IN ('backhaul', 'consolidation', 'backhaul+consolidation', 'single')),

  -- Economics are snapshotted at proposal time so that changing an assumption
  -- later never rewrites history in the analytics view.
  total_km          numeric(8, 1) NOT NULL,
  laden_km          numeric(8, 1) NOT NULL,
  empty_km          numeric(8, 1) NOT NULL,
  -- The baseline every saving is measured against: each order in this trip
  -- served by its own dedicated out-and-back run, which is how it works today.
  baseline_total_km numeric(8, 1) NOT NULL,
  baseline_empty_km numeric(8, 1) NOT NULL,
  -- Fuel this route burns, which the indicative price is derived from.
  fuel_l            numeric(8, 1) NOT NULL,
  fuel_saved_l      numeric(8, 1) NOT NULL,
  money_saved_kzt   integer NOT NULL,
  -- Share of this trip's kilometres that carry cargo. The carrier's own
  -- metric: same distance driven, more of it paid. No freight tariff invented.
  paid_km_share     numeric(4, 3) NOT NULL,
  minutes           integer NOT NULL,

  -- Why the engine put these orders together, in plain language.
  explanation  text NOT NULL,
  explained_by text NOT NULL DEFAULT 'rules' CHECK (explained_by IN ('ai', 'rules')),

  created_at   timestamptz NOT NULL DEFAULT now(),
  accepted_at  timestamptz,
  completed_at timestamptz
);

CREATE INDEX trips_status_idx ON trips (status);
CREATE INDEX trips_vehicle_idx ON trips (vehicle_id);

CREATE TABLE trip_stops (
  id            text PRIMARY KEY,
  trip_id       text NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  seq           integer NOT NULL,
  settlement_id text NOT NULL REFERENCES settlements(id),
  action        text NOT NULL CHECK (action IN ('pickup', 'dropoff')),
  order_id      text REFERENCES orders(id),
  -- Set when the driver taps "delivered"; drives the tracking view.
  done_at       timestamptz,
  UNIQUE (trip_id, seq)
);

CREATE INDEX trip_stops_trip_idx ON trip_stops (trip_id);
