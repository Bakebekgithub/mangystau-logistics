import { DispatcherBoard } from "@/components/DispatcherBoard";
import { TopBar } from "@/components/ui";
import { analytics, listFlows, listSettlements, listTrips } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function AkimatPage() {
  const [stats, flows, settlements, proposed, accepted, inTransit, completed] = await Promise.all([
    analytics(),
    listFlows(),
    listSettlements(),
    listTrips("proposed"),
    listTrips("accepted"),
    listTrips("in_transit"),
    listTrips("completed"),
  ]);

  return (
    <>
      <TopBar current="akimat" />
      <DispatcherBoard
        stats={stats}
        flows={flows}
        trips={[...proposed, ...accepted, ...inTransit, ...completed]}
        settlements={settlements.map((s) => ({
          id: s.id,
          name_ru: s.name_ru,
          place: s.place,
          population: s.population,
          lat: s.lat,
          lon: s.lon,
        }))}
      />
    </>
  );
}
