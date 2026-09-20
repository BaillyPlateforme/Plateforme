import { listLibraryPhotos } from "@/lib/library";
import { getAiConfig } from "@/lib/ai-config";
import { getQualifConfig } from "@/lib/qualification";
import ConfigClient from "./ConfigClient";

export const dynamic = "force-dynamic";

export default async function ConfigurationPage() {
  const [library, aiConfig, qualifConfig] = await Promise.all([
    listLibraryPhotos(),
    getAiConfig(),
    getQualifConfig(),
  ]);
  return (
    <div className="px-6 py-8 md:px-10">
      <ConfigClient library={library} aiConfig={aiConfig} qualifConfig={qualifConfig} />
    </div>
  );
}
