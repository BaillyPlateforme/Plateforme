import { listTemplates } from "@/lib/templates";
import { listAlerts } from "@/lib/alerts";
import MessagerieTabs from "./MessagerieTabs";

export const dynamic = "force-dynamic";

export default async function MessageriePage() {
  const [templates, rules] = await Promise.all([listTemplates(), listAlerts()]);
  return (
    <div className="px-6 py-8 md:px-10">
      <header className="mb-8">
        <div className="eyebrow text-ink-soft">Outils</div>
        <h1 className="mt-1 font-serif text-4xl">Messagerie</h1>
      </header>
      <MessagerieTabs templates={templates} rules={rules} />
    </div>
  );
}
