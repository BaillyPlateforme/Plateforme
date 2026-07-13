import { getSettings } from "@/lib/settings";
import { checkBrevo } from "@/lib/brevo";
import ParametresClient from "./ParametresClient";

export const dynamic = "force-dynamic";

export default async function ParametresPage() {
  const [settings, brevo] = await Promise.all([getSettings(), checkBrevo()]);
  return (
    <div className="px-6 py-8 md:px-10">
      <header className="mb-8">
        <div className="eyebrow text-ink-soft">Réglages</div>
        <h1 className="mt-1 font-serif text-4xl">Paramètres</h1>
      </header>
      <ParametresClient settings={settings} brevo={brevo} />
    </div>
  );
}
