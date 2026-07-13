import { listTeam } from "@/lib/team";
import EquipeClient from "./EquipeClient";

export const dynamic = "force-dynamic";

export default async function EquipePage() {
  const members = await listTeam();
  return (
    <div className="px-6 py-8 md:px-10">
      <header className="mb-8">
        <div className="eyebrow text-ink-soft">Réglages</div>
        <h1 className="mt-1 font-serif text-4xl">Équipe</h1>
        <p className="mt-1 text-sm text-ink-soft">Gérez les profils et les accès de l&apos;équipe.</p>
      </header>
      <EquipeClient members={members} />
    </div>
  );
}
