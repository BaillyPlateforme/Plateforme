import { listGrids } from "@/lib/grids";
import { listLibraryPhotos } from "@/lib/library";
import { getAiConfig } from "@/lib/ai-config";
import { getQualifConfig } from "@/lib/qualification";
import ConfigClient from "./ConfigClient";

export const dynamic = "force-dynamic";

export default async function ConfigurationPage() {
  const [grids, library, aiConfig, qualifConfig] = await Promise.all([
    listGrids(),
    listLibraryPhotos(),
    getAiConfig(),
    getQualifConfig(),
  ]);
  return (
    <div className="px-6 py-8 md:px-10">
      <header className="mb-8">
        <div className="eyebrow text-ink-soft">Réglages</div>
        <h1 className="mt-1 font-serif text-4xl">Configuration</h1>
      </header>
      <ConfigClient library={library} grids={grids} aiConfig={aiConfig} qualifConfig={qualifConfig} />
    </div>
  );
}
