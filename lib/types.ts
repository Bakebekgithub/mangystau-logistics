export type PlaceKind = "city" | "town" | "village" | "hamlet";

export interface Settlement {
  id: string;
  osm_id?: number | null;
  name_kz: string;
  name_ru: string;
  place: PlaceKind;
  population: number | null;
  lat: number;
  lon: number;
}

export type VehicleKind = "tent" | "refrigerator" | "flatbed" | "tipper";

export interface Vehicle {
  id: string;
  carrier_id: string;
  plate: string;
  kind: VehicleKind;
  capacity_kg: number;
  /** Litres per 100 km running empty. Laden use is derived in economics.ts. */
  fuel_per_100km: number;
  /** Where the vehicle currently is. */
  at_id: string;
}

export interface Carrier {
  id: string;
  name: string;
  phone: string | null;
  base_id: string;
}

export type OrderStatus = "new" | "matched" | "in_transit" | "delivered" | "expired";

export interface Order {
  id: string;
  shipper_name: string;
  shipper_phone?: string | null;
  origin_id: string;
  destination_id: string;
  cargo: string;
  weight_kg: number;
  needs_cooling: boolean;
  /** Body type the shipper insists on. Null means the engine chooses. */
  required_kind?: VehicleKind | null;
  ready_at: string;
  deadline_at: string;
  /** What the shipper offers, in tenge. Set by the shipper, not the engine. */
  offered_price_kzt?: number | null;
  counter_price_kzt?: number | null;
  price_status?: "offered" | "countered" | "agreed";
  status: OrderStatus;
  raw_text?: string | null;
  parsed_by?: "ai" | "rules" | "seed" | null;
}

export type StopAction = "pickup" | "dropoff";

export interface TripStop {
  seq: number;
  settlement_id: string;
  action: StopAction;
  order_id: string;
  done_at?: string | null;
}

/**
 * Distances between settlements, read once from the database and passed into the
 * engine. Keeping the engine ignorant of the database is what makes it testable.
 */
export interface DistanceTable {
  /** Road kilometres. Throws for unknown pairs so a silent zero can't skew economics. */
  km(from: string, to: string): number;
  minutes(from: string, to: string): number;
  has(from: string, to: string): boolean;
}

/** What the engine produces: a route plus the economics of choosing it. */
export interface TripPlan {
  vehicle_id: string;
  stops: TripStop[];
  order_ids: string[];
  /** Kind of saving this plan represents, which changes how it is presented. */
  kind: "backhaul" | "consolidation" | "backhaul+consolidation" | "single";
  total_km: number;
  laden_km: number;
  empty_km: number;
  baseline_total_km: number;
  baseline_empty_km: number;
  /** Fuel this route actually burns, used for the indicative price. */
  fuel_l: number;
  fuel_saved_l: number;
  money_saved_kzt: number;
  paid_km_share: number;
  minutes: number;
  explanation: string;
}
