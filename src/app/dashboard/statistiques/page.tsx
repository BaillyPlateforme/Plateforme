import { listRequests } from "@/lib/requests";
import StatsTabs from "./StatsTabs";
import type { RequestRow } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function StatistiquesPage() {
  let requests: RequestRow[] = [];
  try {
    requests = await listRequests();
  } catch {
    /* zéro */
  }

  return (
    <div className="px-6 py-8 md:px-10">
      <StatsTabs requests={requests} />
    </div>
  );
}
