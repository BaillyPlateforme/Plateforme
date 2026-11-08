import Bandeau from "@/ui/Bandeau";
import { intervenants } from "@/crm/conteneurs/donnees";
import { creerConteneur } from "@/crm/conteneurs/actions";
import ChampsConteneur from "@/crm/conteneurs/ChampsConteneur";
import GrilleJalons from "@/crm/conteneurs/GrilleJalons";
import LignesCouts from "@/crm/conteneurs/LignesCouts";
import Formulaire from "@/crm/exploitation/ui/Formulaire";
import u from "@/crm/exploitation/ui/ui.module.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Nouveau conteneur" };

/*
 * La saisie d'un conteneur, comme dans Créagidem : identification, transport
 * (navire, compagnie, transitaire, groupeur, dégroupeur, références), départ
 * et arrivée, jalons prévus (et réels si déjà connus), coûts prévus et un
 * premier commentaire. Les clients s'ajoutent ensuite, depuis sa fiche ou
 * depuis le dispatch international.
 */
export default async function NouveauConteneur() {
  const annuaire = await intervenants();
  const aujourdhui = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Paris" });
  return (
    <div className="view">
      <Bandeau
        surtitre="Exploitation · Conteneurs"
        titre="Nouveau conteneur"
        texte="Identification, transport, trajet, jalons et coûts prévus. Les clients s’ajoutent ensuite."
        secondaire={{ label: "Tous les conteneurs", href: "/conteneurs" }}
      />
      <Formulaire action={creerConteneur} className={u.ecran}>
        <section className={u.carte}>
          <ChampsConteneur annuaire={annuaire} />
        </section>
        <section className={u.carte}>
          <div className={u.carteTete}>
            <div>
              <h3>Jalons</h3>
              <p className={u.sousTitre}>Les dates prévues ; les dates réelles se complètent au fil du voyage.</p>
            </div>
          </div>
          <GrilleJalons jalons={{}} aujourdhui={aujourdhui} />
        </section>
        <section className={u.carte}>
          <div className={u.carteTete}>
            <div>
              <h3>Coûts et marge</h3>
              <p className={u.sousTitre}>Montants HT. Prix de revient et prix de vente, prévus puis réalisés : la marge se calcule seule.</p>
            </div>
          </div>
          <LignesCouts couts={[]} fournisseurs={annuaire.tous} />
        </section>
        <section className={u.carte}>
          <div className={u.champ} style={{ gridColumn: "auto" }}>
            <label htmlFor="commentaire">Commentaire</label>
            <textarea id="commentaire" name="commentaire" placeholder="Consignes, réserves, échanges avec le transitaire…" />
          </div>
          <div className={u.pied} style={{ marginTop: 16 }}>
            <button type="submit" className={u.bouton}>
              Créer le conteneur
            </button>
          </div>
        </section>
      </Formulaire>
    </div>
  );
}
