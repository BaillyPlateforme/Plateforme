import { listGrids } from "@/lib/grids";
import { listLibraryPhotos } from "@/lib/library";
import PlaygroundShell from "./PlaygroundShell";

export const dynamic = "force-dynamic";

export default async function PlaygroundPage() {
  const [grids, library] = await Promise.all([
    listGrids().then((g) => g.filter((x) => x.is_active)),
    listLibraryPhotos(),
  ]);
  return (
    <div className="px-6 py-8 md:px-10">
      <header className="mb-8">
        <div className="eyebrow text-ink-soft">Outils</div>
        <h1 className="mt-1 font-serif text-4xl">Playground &amp; Lab</h1>
        <p className="mt-1 text-sm text-ink-soft">
          Testez l&apos;analyse d&apos;image et la chaîne complète (mails → demandes) de bout en bout.
        </p>
      </header>
      <PlaygroundShell grids={grids} library={library} />
    </div>
  );
}
