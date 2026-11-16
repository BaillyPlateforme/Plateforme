import { currentUser } from "@/crm/lib/auth";
import Bandeau from "@/ui/Bandeau";
import { AvecMenu } from "@/ui/MenuVertical";
import MenuReglages from "@/crm/reglages/MenuReglages";
import { surtitreReglages } from "@/crm/reglages/pages";
import { lireParametres } from "@/crm/devis/donnees";
import { enregistrerParametres } from "@/crm/devis/actions";
import { ARRHES_CODE, TVA_CODE } from "@/crm/devis/modele";
import { VUS_DANS_CREAGIDEM } from "@/crm/devis/parametres";
import s from "@/crm/devis/liste.module.css";

export const dynamic = "force-dynamic";

/*
 * Les paramètres du devis, à fournir par Bailly : CGV, taux et formulations.
 * Un champ vide reprend la valeur déjà présente dans le CRM (indiquée), ou
 * n'imprime rien (CGV, taux de garantie) : aucune valeur n'est inventée.
 */

const nb = (v: number | null) => (v == null ? "" : String(v).replace(".", ","));

export default async function Parametres({ searchParams }: { searchParams: Promise<{ ok?: string }> }) {
  await currentUser();
  const p = await lireParametres();
  const ok = (await searchParams).ok === "1";
  return (
    <div className="view">
      <Bandeau surtitre={surtitreReglages("/devis/parametres")} titre="Réglages" texte="Paramètres du devis · ce que Bailly fournit une fois pour tous les devis : CGV, taux, formulations proposées à la saisie." />
      <AvecMenu menu={<MenuReglages />}>
        <form action={enregistrerParametres} className={`${s.page} ${s.formulaire}`}>
          {ok && <p className={s.ok}>Paramètres enregistrés : ils valent pour les prochains devis et pour l&apos;impression de tous.</p>}
          <section className={s.carte}>
            <header className={s.carteTete}><p>Valeurs par défaut</p><h2>Taux et délais</h2></header>
            <div className={s.grille}>
              <label className={s.champ}><span>Arrhes à la commande (%)</span><input name="arrhesPct" inputMode="decimal" defaultValue={nb(p.arrhesPct)} placeholder={String(ARRHES_CODE)} /><small>Vide : {ARRHES_CODE} %, valeur actuelle du CRM.</small></label>
              <label className={s.champ}><span>Validité du devis (jours)</span><input name="validiteJours" inputMode="numeric" defaultValue={nb(p.validiteJours)} placeholder="1 mois" /><small>Vide : un mois, jusqu&apos;à la même date le mois suivant (règle de Bailly).</small></label>
              <label className={s.champ}><span>TVA par défaut des lignes (%)</span><input name="tvaDefaut" inputMode="decimal" defaultValue={nb(p.tvaDefaut)} placeholder={String(TVA_CODE)} /><small>Vide : {TVA_CODE} %, taux du devis Bailly.</small></label>
              <label className={s.champ}><span>TVA de la garantie (%)</span><input name="tvaAssurance" inputMode="decimal" defaultValue={nb(p.tvaAssurance)} placeholder="Comme les lignes" /><small>À confirmer par Bailly.</small></label>
              <label className={s.champ}><span>Taux garantie contractuelle (%)</span><input name="tauxContractuelle" inputMode="decimal" defaultValue={nb(p.tauxContractuelle)} placeholder="À fournir" /><small>Aucun taux prérempli.</small></label>
              <label className={s.champ}><span>Taux garantie dommage standard (%)</span><input name="tauxDommage" inputMode="decimal" defaultValue={nb(p.tauxDommage)} placeholder="À fournir" /><small>Aucun taux prérempli.</small></label>
              <label className={s.champ}><span>Taux garantie dommage luxe (%)</span><input name="tauxLuxe" inputMode="decimal" defaultValue={nb(p.tauxLuxe)} placeholder="À fournir" /><small>Aucun taux prérempli.</small></label>
            </div>
          </section>
          <section className={s.carte}>
            <header className={s.carteTete}><p>Saisie</p><h2>Formulations proposées</h2></header>
            <div className={s.grille}>
              <label className={s.champ} data-large><span>Conditions de règlement du solde</span><textarea name="reglementsSolde" defaultValue={p.reglementsSolde.join("\n")} placeholder={VUS_DANS_CREAGIDEM.reglementsSolde.join("\n")} /><small>Une par ligne. Vu dans Créagidem : « {VUS_DANS_CREAGIDEM.reglementsSolde.join(" », « ")} ».</small></label>
              <label className={s.champ} data-large><span>Origines de la demande</span><textarea name="origines" defaultValue={p.origines.join("\n")} /><small>Une par ligne.</small></label>
              <label className={s.champ} data-large><span>Modes de règlement</span><textarea name="modesReglement" defaultValue={p.modesReglement.join("\n")} placeholder={VUS_DANS_CREAGIDEM.modesReglement.join("\n")} /><small>Une par ligne. Vu dans Créagidem : « Chèque ».</small></label>
              <label className={s.champ} data-large><span>Comptes (encaissement, achats)</span><textarea name="comptes" defaultValue={p.comptes.join("\n")} placeholder={VUS_DANS_CREAGIDEM.comptes.join("\n")} /><small>Une par ligne. Vu dans Créagidem : « Encaissements virements ».</small></label>
            </div>
          </section>
          <section className={s.carte}>
            <header className={s.carteTete}><p>Document</p><h2>Conditions générales de vente</h2></header>
            <label className={s.champ}><span>Texte des CGV, imprimé en page 2 du devis</span><textarea name="cgv" defaultValue={p.cgv} placeholder="Texte à fournir par Bailly. Tant qu'il est vide, le devis n'imprime pas de CGV." /></label>
          </section>
          <div className={s.pied}>
            <p>Les champs vides reprennent la valeur indiquée ; rien n&apos;est inventé.</p>
            <button className={s.enregistrer}>Enregistrer les paramètres</button>
          </div>
        </form>
      </AvecMenu>
    </div>
  );
}
