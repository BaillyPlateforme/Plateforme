import { listTemplates } from "@/lib/templates";
import { listAlerts } from "@/lib/alerts";
import MessagerieTabs from "./MessagerieTabs";

export const dynamic = "force-dynamic";

export default async function MessageriePage() {
  const [templates, rules] = await Promise.all([listTemplates(), listAlerts()]);
  return (
    <div className="px-6 py-8 md:px-10">
      <MessagerieTabs templates={templates} rules={rules} />
    </div>
  );
}
