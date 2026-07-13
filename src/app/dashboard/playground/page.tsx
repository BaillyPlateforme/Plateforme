import { listGrids } from "@/lib/grids";
import { listLibraryPhotos } from "@/lib/library";
import PlaygroundClient from "./PlaygroundClient";

export const dynamic = "force-dynamic";

export default async function PlaygroundPage() {
  const [grids, library] = await Promise.all([
    listGrids().then((g) => g.filter((x) => x.is_active)),
    listLibraryPhotos(),
  ]);
  return (
    <div className="px-6 py-8 md:px-10">
      <header className="mb-8">
        <h1 className="font-serif text-3xl">Playground</h1>
        <p className="mt-1 text-sm text-ink-soft">
          Sélectionnez des photos dans la base, l&apos;IA les analyse et génère un devis de test.
        </p>
      </header>
      <PlaygroundClient grids={grids} library={library} />
    </div>
  );
}
