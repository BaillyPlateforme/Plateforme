import { listGrids } from "@/lib/grids";
import GridsManager from "./GridsManager";

export const dynamic = "force-dynamic";

export default async function GrillesPage() {
  const grids = await listGrids();
  return (
    <div className="px-6 py-8 md:px-10">
      <header className="mb-8">
        <h1 className="font-serif text-3xl">Grilles tarifaires</h1>
        <p className="mt-1 text-sm text-ink-soft">
          Configurez le chiffrage : forfaits, prix au m³, au km, majorations.
        </p>
      </header>
      <GridsManager grids={grids} />
    </div>
  );
}
