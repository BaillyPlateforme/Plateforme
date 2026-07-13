import { getSettings } from "@/lib/settings";
import { listTemplates } from "@/lib/templates";
import { listAlerts } from "@/lib/alerts";
import { checkBrevo } from "@/lib/brevo";
import ParametresTabs from "./ParametresTabs";

export const dynamic = "force-dynamic";

export default async function ParametresPage() {
  const [settings, templates, alerts, brevo] = await Promise.all([
    getSettings(),
    listTemplates(),
    listAlerts(),
    checkBrevo(),
  ]);

  return (
    <div className="px-6 py-8 md:px-10">
      <header className="mb-8">
        <div className="eyebrow text-ink-soft">Réglages</div>
        <h1 className="mt-1 font-serif text-4xl">Paramètres</h1>
      </header>
      <ParametresTabs settings={settings} templates={templates} alerts={alerts} brevo={brevo} />
    </div>
  );
}
