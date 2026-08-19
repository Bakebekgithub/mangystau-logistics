import { DemoRunner } from "@/components/DemoRunner";
import { TopBar } from "@/components/ui";
import { listSettlements } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function DemoPage() {
  const settlements = await listSettlements();

  return (
    <>
      <TopBar />
      <main className="mx-auto max-w-6xl px-4 py-6">
        <DemoRunner
          settlements={settlements.map((s) => ({
            id: s.id,
            name_ru: s.name_ru,
            place: s.place,
            population: s.population,
            lat: s.lat,
            lon: s.lon,
          }))}
        />
      </main>
    </>
  );
}
