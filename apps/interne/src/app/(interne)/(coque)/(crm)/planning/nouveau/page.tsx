import { currentUser } from "@/crm/lib/auth";
import { commerciaux } from "@/crm/lib/data";
import { q1 } from "@/crm/lib/db";
import { lundiDuJour } from "@/crm/planning/grille";
import Planificateur from "@/crm/planning/planificateur/Planificateur";
import { dossierPlanif, dossiersOuverts, instantPage, semaineParDefaut, semainePlanif, sourcePlanif } from "@/crm/planning/planificateur/donnees";
import { dureeParDefaut } from "@/crm/planning/planificateur/regles";
import { estTypeRdv, type TypeRdv } from "@/crm/planning/types-rdv";

export const dynamic = "force-dynamic";

/*
 * Planifier une visite (?dossier=<id>) ou poser un rendez-vous au planning
 * (sans dossier) : le planificateur de src/crm/planning/planificateur.
 *
 * - ?dossier=<id>   : tout ce que le dossier sait est déjà là (client, adresse,
 *                     étage et accès, commercial du dossier) ;
 * - &depuis=<rdv>   : une nouvelle visite à partir d'une autre (type, lieu,
 *                     observations, durée et commercial repris) ;
 * - &com, &semaine  : le commercial et la semaine montrés ;
 * - &type           : phys, visio, tache ou perso.
 *
 * Le bloc « Prochaine étape » d'un dossier sans visite mène ici.
 */
export default async function NouveauRdv({
  searchParams,
}: {
  searchParams: Promise<{ dossier?: string; depuis?: string; com?: string; semaine?: string; type?: string }>;
}) {
  const sp = await searchParams;
  const entier = (v?: string) => (/^\d+$/.test(v ?? "") ? Number(v) : null);
  const [u, coms] = await Promise.all([currentUser(), commerciaux()]);
  const dossier = entier(sp.dossier) ? await dossierPlanif(entier(sp.dossier)!) : null;
  const source = dossier && entier(sp.depuis) ? await sourcePlanif(dossier.id, entier(sp.depuis)!) : null;
  const type: TypeRdv = source?.type ?? (estTypeRdv(sp.type) ? sp.type : "phys");

  // Le commercial : celui demandé, sinon celui de la visite reprise, celui du dossier, l'utilisateur s'il est commercial, le premier.
  const liste = coms.map((c) => ({ id: c.id as number, nom: c.nom as string }));
  const voulu = [entier(sp.com), source?.commercialId, dossier?.commercialId, u.role === "commercial" ? u.id : null].find((x): x is number => !!x) ?? liste[0]?.id ?? u.id;
  if (!liste.some((c) => c.id === voulu)) {
    const autre = await q1<{ id: number; nom: string }>("select id, nom from utilisateurs where id = $1", [voulu]);
    if (autre) liste.push(autre);
  }
  const commercialId = liste.some((c) => c.id === voulu) ? voulu : (liste[0]?.id ?? u.id);
  if (!liste.length) liste.push({ id: u.id, nom: u.nom });

  const lundi = /^\d{4}-\d{2}-\d{2}$/.test(sp.semaine ?? "") ? lundiDuJour(sp.semaine!) : semaineParDefaut();
  const duree = source?.duree ?? dureeParDefaut(type);
  const [semaine, dossiers] = await Promise.all([semainePlanif(commercialId, lundi, dossier?.id ?? null, type, duree), dossier ? Promise.resolve([]) : dossiersOuverts()]);

  return (
    <Planificateur
      // Un autre dossier, ou une autre visite reprise : le planificateur repart de leurs données.
      key={`${dossier?.id ?? "sans"}-${source?.id ?? "neuf"}`}
      dossier={dossier}
      source={source}
      dossiers={dossiers}
      commerciaux={liste}
      commercialInitial={commercialId}
      semaineInitiale={semaine}
      maintenantInitial={instantPage()}
      typeInitial={type}
    />
  );
}
