import { listAlerts } from "@/lib/alerts";
import { listTemplates } from "@/lib/templates";
import WorkflowBuilder from "./WorkflowBuilder";

export const dynamic = "force-dynamic";

export default async function WorkflowPage() {
  const [rules, templates] = await Promise.all([listAlerts(), listTemplates()]);
  return (
    <div className="px-6 py-8 md:px-10">
      <WorkflowBuilder rules={rules} templates={templates} />
    </div>
  );
}
