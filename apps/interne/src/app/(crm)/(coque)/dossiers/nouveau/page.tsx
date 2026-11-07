import { commerciaux } from "@/crm/lib/data";
import { q } from "@/crm/lib/db";
import { currentUser } from "@/crm/lib/auth";
import { creerDossier } from "@/crm/actions";

export const dynamic = "force-dynamic";

export default async function NouveauDossier() {
  const [coms, tous, u] = await Promise.all([commerciaux(), q("select id,nom from utilisateurs order by id"), currentUser()]);
  return (
    <div className="view">
      <div className="page-h"><div><h1>Nouveau dossier</h1><p>Le type de client détermine le parcours : particulier (devis, paiement en ligne), compte (pas de facture client), militaire (documents à déposer)…</p></div></div>
      <form action={creerDossier}>
        <div className="d-grid">
          <section className="card" style={{ gridColumn: "span 12" }}>
            <h3>Client</h3>
            <div className="form-grid">
              <div className="fld w4"><label>Type de client</label><select name="type" defaultValue="particulier"><option value="particulier">Particulier</option><option value="compte">Compte entreprise</option><option value="militaire">Militaire</option><option value="partenaire">Partenaire / agent</option></select></div>
              <div className="fld w4"><label>Civilité</label><select name="civilite"><option value="">—</option><option>Madame</option><option>Monsieur</option></select></div>
              <div className="fld w4"><label>Société (comptes)</label><input type="text" name="societe" /></div>
              <div className="fld w4"><label>Prénom</label><input type="text" name="prenom" /></div>
              <div className="fld w4"><label>Nom</label><input type="text" name="nom" required /></div>
              <div className="fld w4"><label>Téléphone</label><input type="tel" name="telephone" /></div>
              <div className="fld w12"><label>E-mail</label><input type="email" name="email" /></div>
            </div>
          </section>
          <section className="card" style={{ gridColumn: "span 12" }}>
            <h3>Déménagement</h3>
            <div className="form-grid">
              <div className="fld w8"><label>Adresse de départ</label><input type="text" name="depart" /></div>
              <div className="fld w4"><label>Étage / ascenseur</label><div className="rowform"><input type="text" name="depart_etage" placeholder="4e" /><label className="chk"><input type="checkbox" name="depart_asc" />Asc.</label></div></div>
              <div className="fld w8"><label>Adresse d’arrivée</label><input type="text" name="arrivee" /></div>
              <div className="fld w4"><label>Étage / ascenseur</label><div className="rowform"><input type="text" name="arrivee_etage" placeholder="RDC" /><label className="chk"><input type="checkbox" name="arrivee_asc" />Asc.</label></div></div>
              <div className="fld w12"><label className="chk"><input type="checkbox" name="garde_meuble" />Passage par un garde-meuble (crée une rupture de charge, donc 2 lettres de voiture)</label></div>
              <div className="fld w4"><label>Période souhaitée</label><input type="text" name="periode" placeholder="Fin janvier 2027" /></div>
              <div className="fld w4"><label>Mois de rattachement du CA</label><input type="month" name="mois_ca" /></div>
              <div className="fld w4"><label>Volume estimé (m³)</label><input type="number" step="0.1" name="volume" /></div>
              <div className="fld w4"><label>Commercial</label><select name="commercial_id" defaultValue={u.role === "commercial" ? u.id : ""}><option value="">—</option>{coms.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}</select></div>
              <div className="fld w4"><label>Dossier traité par</label><select name="traite_par_id" defaultValue=""><option value="">—</option>{tous.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}</select></div>
              <div className="fld w12"><label>Observations (ce que le client a dit au téléphone, concurrents, accès…)</label><textarea name="observations" /></div>
            </div>
          </section>
        </div>
        <div className="form-actions"><button className="btn primary">Créer le dossier</button></div>
      </form>
    </div>
  );
}
