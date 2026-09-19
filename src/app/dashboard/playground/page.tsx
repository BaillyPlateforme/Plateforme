import { listLibraryPhotos } from "@/lib/library";
import PlaygroundShell from "./PlaygroundShell";

export const dynamic = "force-dynamic";

export default async function PlaygroundPage() {
  const library = await listLibraryPhotos();
  return (
    <div className="px-6 py-8 md:px-10">
      <header className="mb-8">
        <div className="eyebrow text-ink-soft">Outils</div>
        <h1 className="mt-1 font-serif text-4xl">Playground &amp; Lab</h1>
        <p className="mt-1 text-sm text-ink-soft">
          Testez l&apos;analyse d&apos;image et la chaîne complète (mails → demandes) de bout en bout.
        </p>
      </header>
      <PlaygroundShell library={library} />
    </div>
  );
}
