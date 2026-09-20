import { listTeam } from "@/lib/team";
import EquipeClient from "./EquipeClient";

export const dynamic = "force-dynamic";

export default async function EquipePage() {
  const members = await listTeam();
  return (
    <div className="px-6 py-8 md:px-10">
      <EquipeClient members={members} />
    </div>
  );
}
