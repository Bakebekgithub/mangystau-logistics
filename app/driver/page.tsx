import { DriverConsole } from "@/components/DriverConsole";
import { TopBar } from "@/components/ui";
import { indicativePriceKzt } from "@/lib/engine/economics";
import { listSettlements, listTrips, listUnplannedOrders } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function DriverPage() {
  const [proposed, accepted, inTransit, unplanned, settlements] = await Promise.all([
    listTrips("proposed"),
    listTrips("accepted"),
    listTrips("in_transit"),
    listUnplannedOrders(),
    listSettlements(),
  ]);

  const active = [...inTransit, ...accepted];

  // Prices are derived on the server so the client never re-implements the
  // economics — there is one source of truth for every figure shown.
  const priceOf = Object.fromEntries(
    [...proposed, ...active].map((trip) => [trip.id, indicativePriceKzt(trip.fuel_l)]),
  );

  return (
    <>
      <TopBar current="driver" />
      <DriverConsole
        proposed={proposed}
        active={active}
        unplanned={unplanned}
        settlements={settlements.map((s) => ({
          id: s.id,
          name_ru: s.name_ru,
          place: s.place,
          population: s.population,
          lat: s.lat,
          lon: s.lon,
        }))}
        priceOf={priceOf}
      />
    </>
  );
}
