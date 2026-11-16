"use client";
import { ACCES_MONTE_MEUBLE, ACCES_STATIONNEMENT, GENRE_ETAPE } from "@/lib/visite/regles";
import ChampAdresse from "@/ui/ChampAdresse";
import { FORMULES, nouvelId, type Contrat, type DossierDevis, type Etape, type Moyens } from "../modele";
import { Champ, Interrupteur, Nombre, PICTOS, Pic, Section, Segment, euros } from "./champs";
import s from "../editeur.module.css";

/*
 * Les onglets « fiche » de la fenêtre Devis : adresses et accès (ceux du
 * dossier), données contractuelles, divers (champs du dossier) et moyens.
 */

const TYPES_DEMENAGEMENT: [string, string][] = [
  ["national", "National"], ["international", "International"], ["maritime", "International maritime"],
  ["aerien", "International aérien"], ["gm", "Garde-meuble seul"], ["bureau", "Transfert de bureau"],
];
const TYPES_CLIENT: [string, string][] = [["particulier", "Particulier"], ["compte", "Client compte"], ["militaire", "CIMOB/DICOM"], ["partenaire", "Partenaire"], ["logement_social", "Logement social"]];

/* ---------- Adresses et accès ---------- */

export function OngletAdresses({ etapes, onChange }: { etapes: Etape[]; onChange: (e: Etape[]) => void }) {
  const maj = (id: number, p: Partial<Etape>) => onChange(etapes.map((e) => (e.id === id ? { ...e, ...p } : e)));
  const ajouter = () => {
    const i = etapes.findIndex((e) => e.genre === "arrivee");
    const nouvelle: Etape = {
      id: -Date.now(), genre: "autre", adresse: "", codePostal: "", ville: "", pays: "", telephone: "", etage: "", ascenseur: false,
      monteCharge: false, transbordement: false, portage: null, monteMeuble: "", stationnement: "", acces: "",
    };
    const l = [...etapes];
    l.splice(i >= 0 ? i : l.length, 0, nouvelle);
    onChange(l);
  };
  const depart = etapes.find((e) => e.genre === "depart"), arrivee = [...etapes].reverse().find((e) => e.genre === "arrivee");
  const itineraire = depart?.adresse && arrivee?.adresse
    ? `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent([depart.adresse, depart.codePostal, depart.ville].filter(Boolean).join(" "))}&destination=${encodeURIComponent([arrivee.adresse, arrivee.codePostal, arrivee.ville].filter(Boolean).join(" "))}`
    : null;
  return (
    <Section
      surtitre="Adresses et accès"
      titre="Chargement, étapes et livraison"
      texte="Les adresses du dossier : ce qui est saisi ici se retrouve sur la fiche, la fenêtre de visite et le devis imprimé."
      actions={
        <>
          {itineraire && <a className={s.boutonDoux} href={itineraire} target="_blank" rel="noreferrer"><Pic d={PICTOS.carte} /> Itinéraire</a>}
          <button type="button" className={s.boutonDoux} onClick={ajouter}><Pic d={PICTOS.plus} /> Ajouter une étape</button>
        </>
      }
    >
      <div className={s.etapes}>
        {etapes.map((e, i) => (
          <article key={e.id} className={s.etape} data-genre={e.genre}>
            <header>
              <span className={s.pastille}>{i + 1}</span>
              <h3>{e.genre === "depart" ? "Chargement" : e.genre === "arrivee" ? "Livraison" : GENRE_ETAPE[e.genre] ?? "Étape"}</h3>
              {!["depart", "arrivee"].includes(e.genre) && (
                <button type="button" className={s.retirerEtape} onClick={() => onChange(etapes.filter((x) => x.id !== e.id))}>Retirer</button>
              )}
            </header>
            <div className={s.grille}>
              <Champ label="Adresse" large={4}>
                <ChampAdresse
                  saisie="voie"
                  value={e.adresse}
                  onChange={(x) => maj(e.id, { adresse: x })}
                  onChoisir={(a) => maj(e.id, { adresse: a.voie, codePostal: a.codePostal, ville: a.ville, pays: "France" })}
                />
              </Champ>
              <Champ label="Code postal" large={1}><input type="text" value={e.codePostal} onChange={(x) => maj(e.id, { codePostal: x.target.value })} /></Champ>
              <Champ label="Ville" large={1}>
                <ChampAdresse
                  mode="ville"
                  value={e.ville}
                  onChange={(x) => maj(e.id, { ville: x })}
                  onChoisir={(a) => maj(e.id, { ville: a.ville, codePostal: a.codePostal, pays: "France" })}
                />
              </Champ>
              <Champ label="Pays" large={1}><input type="text" value={e.pays} placeholder="France" onChange={(x) => maj(e.id, { pays: x.target.value })} /></Champ>
              <Champ label="Téléphone sur place" large={2}><input type="tel" value={e.telephone} onChange={(x) => maj(e.id, { telephone: x.target.value })} /></Champ>
              <Champ label="Étage" large={1}><input type="text" value={e.etage} placeholder="RDC" onChange={(x) => maj(e.id, { etage: x.target.value })} /></Champ>
              <Champ label="Portage" large={1}><Nombre valeur={e.portage} onChange={(v) => maj(e.id, { portage: v == null ? null : Math.round(v) })} suffixe="m" min={0} max={1000} /></Champ>
              <Champ label="Monte-meuble" large={1}>
                <select value={e.monteMeuble} onChange={(x) => maj(e.id, { monteMeuble: x.target.value })}>
                  <option value="">—</option>
                  {Object.entries(ACCES_MONTE_MEUBLE).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
              </Champ>
              <Champ label="Stationnement" large={2}>
                <select value={e.stationnement} onChange={(x) => maj(e.id, { stationnement: x.target.value })}>
                  <option value="">—</option>
                  {Object.entries(ACCES_STATIONNEMENT).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
              </Champ>
              <div className={s.cases} data-large={6}>
                <Interrupteur actif={e.ascenseur} onChange={(v) => maj(e.id, { ascenseur: v })} label="Ascenseur" />
                <Interrupteur actif={e.monteCharge} onChange={(v) => maj(e.id, { monteCharge: v })} label="Monte-charge" />
                <Interrupteur actif={e.transbordement} onChange={(v) => maj(e.id, { transbordement: v })} label="Transbordement" />
              </div>
              <Champ label="Détails d'accès" large={6}><input type="text" value={e.acces} placeholder="Code, cour, rue étroite, accès poids lourd…" onChange={(x) => maj(e.id, { acces: x.target.value })} /></Champ>
            </div>
          </article>
        ))}
      </div>
    </Section>
  );
}

/* ---------- Données contractuelles ---------- */

export function OngletContrat({
  contrat, onChange, utilisateurs, volume, ttc, suggestionsReglement, parDefaut,
}: {
  contrat: Contrat;
  onChange: (c: Contrat) => void;
  utilisateurs: { id: number; nom: string; role: string }[];
  volume: number;
  ttc: number;
  suggestionsReglement: string[];
  parDefaut: { arrhesPct: number; validiteJours: number };
}) {
  const maj = (p: Partial<Contrat>) => onChange({ ...contrat, ...p });
  const joursValidite = contrat.validite && contrat.dateDevis
    ? Math.round((new Date(`${contrat.validite}T12:00:00Z`).getTime() - new Date(`${contrat.dateDevis}T12:00:00Z`).getTime()) / 86400000)
    : null;
  const validiteDepuisJours = (j: number | null) => {
    if (j == null || !contrat.dateDevis) return maj({ validite: "" });
    const d = new Date(`${contrat.dateDevis}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + Math.round(j));
    maj({ validite: d.toISOString().slice(0, 10) });
  };
  return (
    <>
      <Section surtitre="Visite et devis" titre="Données contractuelles" texte="Ce qui fonde le devis : qui l'établit, quand, pour combien de temps.">
        <div className={s.grille}>
          <Champ label="Commercial" large={2}>
            <select value={contrat.commercialId ?? ""} onChange={(e) => maj({ commercialId: e.target.value ? Number(e.target.value) : null })}>
              <option value="">—</option>
              {utilisateurs.map((u) => <option key={u.id} value={u.id}>{u.nom}</option>)}
            </select>
          </Champ>
          <Champ label="Date du devis" large={1}><input type="date" value={contrat.dateDevis} onChange={(e) => maj({ dateDevis: e.target.value })} /></Champ>
          <Champ label="Date de visite" large={1}><input type="date" value={contrat.dateVisite} onChange={(e) => maj({ dateVisite: e.target.value })} /></Champ>
          <Champ label="Validité" large={1} aide={`Par défaut : ${parDefaut.validiteJours} jours`}>
            <Nombre valeur={joursValidite} onChange={validiteDepuisJours} suffixe="jours" min={0} max={730} />
          </Champ>
          <Champ label="Valable jusqu'au" large={1}><input type="date" value={contrat.validite} onChange={(e) => maj({ validite: e.target.value })} /></Champ>
          <Champ label="Réf. interne (bon de commande du compte)" large={3}><input type="text" value={contrat.refInterne} onChange={(e) => maj({ refInterne: e.target.value })} /></Champ>
          <Champ label="Titre du devis (facultatif)" large={3} aide="Remplace le nom de la formule sur le devis : « Transfert du siège », « Version 2 »…">
            <input type="text" value={contrat.titre} onChange={(e) => maj({ titre: e.target.value })} />
          </Champ>
        </div>
      </Section>

      <Section surtitre="Prestations" titre="Catégorie et transport">
        <div className={s.grille}>
          <Champ label="Catégorie" large={2}>
            <select value={contrat.formule} onChange={(e) => maj({ formule: e.target.value as Contrat["formule"] })}>
              {FORMULES.map((f) => <option key={f.cle} value={f.cle}>{f.nom} · {f.sous.toLowerCase()}</option>)}
            </select>
          </Champ>
          <Champ label="Volume" large={1} aide="Celui du dossier (inventaire)"><input type="text" value={`${String(volume).replace(".", ",")} m³`} readOnly /></Champ>
          <Champ label="Distance" large={1}><Nombre valeur={contrat.distanceKm} onChange={(v) => maj({ distanceKm: v == null ? null : Math.round(v) })} suffixe="km" min={0} /></Champ>
          <Champ label="Poids lourds" large={2}><input type="text" value={contrat.poidsLourds} placeholder="Accès, restrictions de tonnage…" onChange={(e) => maj({ poidsLourds: e.target.value })} /></Champ>
          <Champ label="Type de déplacement" large={2} groupe>
            <Segment label="Type de déplacement" valeur={contrat.deplacement} options={[["route", "Routier"], ["urbain", "Urbain"]]} onChange={(v) => maj({ deplacement: v })} />
          </Champ>
          <Champ label="Type de déménagement" large={2} groupe>
            <Segment label="Groupé ou spécial" valeur={contrat.groupage ? "groupe" : "special"} options={[["groupe", "Groupé"], ["special", "Spécial (camion dédié)"]]} onChange={(v) => maj({ groupage: v === "groupe" })} />
          </Champ>
        </div>
      </Section>

      <Section surtitre="Finances" titre="Arrhes, règlement et conditions particulières" texte="Imprimés dans les conditions du devis, sous la forme saisie ici.">
        <div className={s.grille}>
          <Champ label="Arrhes à verser" large={1} aide={`Par défaut : ${parDefaut.arrhesPct} %`}>
            <Nombre valeur={contrat.arrhesPct} onChange={(v) => maj({ arrhesPct: v })} suffixe="%" min={0} max={100} />
          </Champ>
          <Champ label="Montant des arrhes" large={1}><input type="text" readOnly value={contrat.arrhesPct != null ? euros(Math.round(ttc * contrat.arrhesPct) / 100) : "—"} /></Champ>
          <Champ label="Conditions de règlement du solde" large={4} aide={suggestionsReglement.length ? undefined : "Les formulations de Bailly s'ajoutent dans les paramètres du devis."}>
            <input type="text" list="reglements-solde" value={contrat.reglementSolde} onChange={(e) => maj({ reglementSolde: e.target.value })} />
            <datalist id="reglements-solde">{suggestionsReglement.map((r) => <option key={r} value={r} />)}</datalist>
          </Champ>
          <Champ label="Conditions particulières" large={6}>
            <textarea value={contrat.conditions} rows={3} onChange={(e) => maj({ conditions: e.target.value })} />
          </Champ>
        </div>
      </Section>

      <Section surtitre="Usage interne" titre="Commentaire non édité" texte="Jamais imprimé ni montré au client.">
        <textarea className={s.noteInterne} value={contrat.commentaireInterne} rows={4} placeholder="Note pour l'équipe : négociation, points d'attention…" onChange={(e) => maj({ commentaireInterne: e.target.value })} />
      </Section>
    </>
  );
}

/* ---------- Divers ---------- */

export function OngletDivers({ dossier, onChange, volume, origines }: { dossier: DossierDevis; onChange: (d: DossierDevis) => void; volume: number; origines: string[] }) {
  const maj = (p: Partial<DossierDevis>) => onChange({ ...dossier, ...p });
  return (
    <Section surtitre="Divers" titre="Le dossier en quelques mots" texte="Champs du dossier : les modifier ici les modifie sur la fiche.">
      <div className={s.grille}>
        <Champ label="Type de déménagement" large={2}>
          <select value={dossier.typeDemenagement} onChange={(e) => maj({ typeDemenagement: e.target.value })}>
            {TYPES_DEMENAGEMENT.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </Champ>
        <Champ label="Type de client" large={2} aide="Fixe le parcours de l'espace client.">
          <select value={dossier.typeClient} onChange={(e) => maj({ typeClient: e.target.value })}>
            {TYPES_CLIENT.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </Champ>
        <Champ label="Volume estimé" large={1}><input type="text" readOnly value={`${String(volume).replace(".", ",")} m³`} /></Champ>
        <Champ label="Origine de la demande" large={3}>
          <input type="text" list="origines-demande" value={dossier.origineDemande} placeholder="Site internet, recommandation, compte…" onChange={(e) => maj({ origineDemande: e.target.value })} />
          <datalist id="origines-demande">{origines.map((o) => <option key={o} value={o} />)}</datalist>
        </Champ>
        <div className={s.cases} data-large={3}>
          <Interrupteur actif={dossier.passerEnDernier} onChange={(v) => maj({ passerEnDernier: v })} label="Passer en dernier" aide="Visite ou chargement en fin de tournée" />
        </div>
        <Champ label="Remarques" large={6}>
          <textarea rows={5} value={dossier.observations} placeholder="Remarques de la visite : piano, cave à vider, horaires du client…" onChange={(e) => maj({ observations: e.target.value })} />
        </Champ>
      </div>
    </Section>
  );
}

/* ---------- Moyens ---------- */

export function OngletMoyens({ moyens, onChange }: { moyens: Moyens; onChange: (m: Moyens) => void }) {
  const maj = (p: Partial<Moyens>) => onChange({ ...moyens, ...p });
  return (
    <>
      <Section
        surtitre="Moyens"
        titre="Véhicules"
        actions={<button type="button" className={s.boutonDoux} onClick={() => maj({ vehicules: [...moyens.vehicules, { id: nouvelId("v"), designation: "", immatriculation: "" }] })}><Pic d={PICTOS.plus} /> Ajouter un véhicule</button>}
      >
        {moyens.vehicules.length === 0 && <p className={s.vide}>Aucun véhicule prévu pour l&apos;instant.</p>}
        <div className={s.listeSimple}>
          {moyens.vehicules.map((v) => (
            <div key={v.id} className={s.rangSimple}>
              <Champ label="Véhicule" large={4}><input type="text" value={v.designation} placeholder="Porteur 20 m³, fourgon…" onChange={(e) => maj({ vehicules: moyens.vehicules.map((x) => (x.id === v.id ? { ...x, designation: e.target.value } : x)) })} /></Champ>
              <Champ label="Immatriculation" large={2}><input type="text" value={v.immatriculation} onChange={(e) => maj({ vehicules: moyens.vehicules.map((x) => (x.id === v.id ? { ...x, immatriculation: e.target.value } : x)) })} /></Champ>
              <button type="button" className={s.supprimerRang} aria-label="Retirer le véhicule" onClick={() => maj({ vehicules: moyens.vehicules.filter((x) => x.id !== v.id) })}><Pic d={PICTOS.corbeille} /></button>
            </div>
          ))}
        </div>
        <div className={s.grille} style={{ marginTop: 14 }}>
          <div className={s.cases} data-large={2}><Interrupteur actif={moyens.remorque} onChange={(v) => maj({ remorque: v })} label="Remorque" /></div>
          {moyens.remorque && <Champ label="Remorque : précision" large={4}><input type="text" value={moyens.remorqueDetail} onChange={(e) => maj({ remorqueDetail: e.target.value })} /></Champ>}
        </div>
      </Section>
      <Section surtitre="Moyens" titre="Équipe et durée">
        <div className={s.grille}>
          <Champ label="Déménageurs" large={1}><Nombre valeur={moyens.demenageurs} onChange={(v) => maj({ demenageurs: v == null ? null : Math.round(v) })} min={0} max={99} /></Champ>
          <Champ label="Composition de l'équipe" large={4}><input type="text" value={moyens.equipe} placeholder="Chef d'équipe et déménageurs" onChange={(e) => maj({ equipe: e.target.value })} /></Champ>
          <Champ label="Durée" large={1}><Nombre valeur={moyens.dureeJours} onChange={(v) => maj({ dureeJours: v })} suffixe="jours" min={0} /></Champ>
          <Champ label="Durée : précision" large={4}><input type="text" value={moyens.dureeDetail} placeholder="Chargement puis livraison le lendemain…" onChange={(e) => maj({ dureeDetail: e.target.value })} /></Champ>
          <Champ label="Départ du dépôt" large={3}><input type="datetime-local" value={moyens.departDepot} onChange={(e) => maj({ departDepot: e.target.value })} /></Champ>
          <Champ label="Retour au dépôt" large={3}><input type="datetime-local" value={moyens.retourDepot} onChange={(e) => maj({ retourDepot: e.target.value })} /></Champ>
          <Champ label="Remarques" large={6}><textarea rows={3} value={moyens.remarques} onChange={(e) => maj({ remarques: e.target.value })} /></Champ>
        </div>
      </Section>
    </>
  );
}
