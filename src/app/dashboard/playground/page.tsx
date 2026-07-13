import { listGrids } from "@/lib/grids";
import PlaygroundClient from "./PlaygroundClient";

export const dynamic = "force-dynamic";

export default async function PlaygroundPage() {
  const grids = (await listGrids()).filter((g) => g.is_active);
  return (
    <div className="px-6 py-8 md:px-10">
      <header className="mb-8">
        <h1 className="font-serif text-3xl">Playground</h1>
        <p className="mt-1 text-sm text-ink-soft">
          Générez des devis de test à partir d&apos;une base de photos — sans créer de demande.
        </p>
      </header>
      <PlaygroundClient grids={grids} />
    </div>
  );
}
