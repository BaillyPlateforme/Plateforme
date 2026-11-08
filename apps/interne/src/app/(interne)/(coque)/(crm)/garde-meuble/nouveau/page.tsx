import Bandeau from "@/ui/Bandeau";
import { dossiersRattachables } from "@/crm/garde-meuble/donnees";
import FormulaireContrat from "@/crm/garde-meuble/FormulaireContrat";
import { ident, reglageNombre } from "@/crm/exploitation/commun";
import u from "@/crm/exploitation/ui/ui.module.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Nouveau contrat de garde-meuble" };

/*
 * Le nouveau contrat de garde-meuble. Depuis la fiche d'un dossier, le
 * bouton « Nouveau » de sa section Garde-meubles mène ici avec
 * ?dossier=<id> : le dossier est choisi et le nom du client repris.
 */
export default async function NouveauContrat({ searchParams }: { searchParams: Promise<{ dossier?: string }> }) {
  const sp = await searchParams;
  const dossier = ident(sp.dossier);
  const [dossiers, loyerCaisse] = await Promise.all([dossiersRattachables(dossier), reglageNombre("gm_loyer_caisse")]);
  const choisi = dossiers.find((d) => d.id === dossier);
  return (
    <div className="view">
      <Bandeau
        surtitre="Exploitation · Garde-meuble"
        titre="Nouveau contrat"
        texte={choisi ? `Pour le dossier ${choisi.ref} · ${choisi.client}` : "Le client, le contrat, puis les caisses une par une."}
        secondaire={{ label: choisi ? "Retour au dossier" : "Tous les contrats", href: choisi ? `/dossiers/${choisi.id}` : "/garde-meuble" }}
      />
      <div className={u.ecran}>
        <FormulaireContrat
          dossiers={dossiers}
          dossierInitial={choisi?.id ?? null}
          loyerCaisse={loyerCaisse}
          aujourdhui={new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Paris" })}
        />
      </div>
    </div>
  );
}
