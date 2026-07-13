import { listAlerts } from "@/lib/alerts";
import { listTemplates } from "@/lib/templates";
import WorkflowBuilder from "./WorkflowBuilder";

export const dynamic = "force-dynamic";

export default async function WorkflowPage() {
  const [rules, templates] = await Promise.all([listAlerts(), listTemplates()]);
  return (
    <div className="px-6 py-8 md:px-10">
      <header className="mb-8">
        <div className="eyebrow text-ink-soft">Outils</div>
        <h1 className="mt-1 font-serif text-4xl">Workflow</h1>
        <p className="mt-1 text-sm text-ink-soft">
          Le parcours d&apos;une demande, étape par étape. Cliquez une étape pour définir les actions
          automatiques (email / SMS et quel template).
        </p>
      </header>
      <WorkflowBuilder rules={rules} templates={templates} />
    </div>
  );
}
