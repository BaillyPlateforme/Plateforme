import { redirect } from "next/navigation";
import { currentUser } from "@/crm/lib/auth";
import { visiteAVenir } from "@/crm/planning/planificateur/donnees";

export const dynamic = "force-dynamic";

/*
 * « Modifier la visite » depuis un dossier (la prochaine étape, src/crm/parcours/prochaine.ts) :
 * /planning/modifier?dossier=<id> ouvre le planificateur sur la visite à venir du dossier — celle que la
 * prochaine étape annonce (« Visite prévue le … »). S'il n'y en a plus (annulée entre-temps), on la planifie.
 */
export default async function ModifierLaVisite({ searchParams }: { searchParams: Promise<{ dossier?: string }> }) {
  await currentUser();
  const sp = await searchParams;
  const dossierId = /^\d+$/.test(sp.dossier ?? "") ? Number(sp.dossier) : null;
  if (!dossierId) redirect("/planning");
  const r = await visiteAVenir(dossierId);
  redirect(r ? `/planning/${r.id}` : `/planning/nouveau?dossier=${dossierId}`);
}
