"use client";
import { useEffect, useId, useState, useTransition } from "react";
import Fenetre, { Champ } from "./Fenetre";
import { chercherPayeurs, choisirPayeur, creerPayeur, majAdresseFacturation } from "./actions";
import type { Payeur } from "./donnees";
import { initiales } from "@/crm/lib/format";
import ChampAdresse from "@/ui/ChampAdresse";
import s from "./facturation.module.css";

type Adresse = { adresse: string; codePostal: string; ville: string; pays: string; siren: string; tvaIntracom: string };
const adresseDe = (p: Payeur | null): Adresse => ({
  adresse: p?.adresse ?? "", codePostal: p?.codePostal ?? "", ville: p?.ville ?? "", pays: p?.pays ?? "", siren: p?.siren ?? "", tvaIntracom: p?.tvaIntracom ?? "",
});
/** « 12 rue X, 75011 Paris » → rue, code postal, ville. */
function decouper(a: string): Pick<Adresse, "adresse" | "codePostal" | "ville"> {
  const m = a.match(/^(.*?)[,\s]+(\d{5})\s+(.+)$/);
  return m ? { adresse: m[1].trim(), codePostal: m[2], ville: m[3].trim() } : { adresse: a, codePostal: "", ville: "" };
}
const TYPES: [string, string][] = [["compte", "Compte (entreprise cliente)"], ["partenaire", "Partenaire, confrère"], ["particulier", "Particulier"]];

/**
 * « Client facturé : lui-même / un compte » (Créagidem, liste des clients
 * et §P) : le payeur du dossier, son adresse de facturation, ses
 * identifiants d'entreprise (SIREN, TVA intracommunautaire) et le bon de
 * commande du compte. Le payeur est figé sur chaque facture à son émission.
 */
export default function FenetrePayeur({
  dossierId, client, payeur, bonCommande, adresses, onFermer,
}: {
  dossierId: number;
  client: Payeur;
  payeur: Payeur | null;
  bonCommande: string | null;
  adresses: { depart: string | null; arrivee: string | null };
  onFermer: () => void;
}) {
  const id = useId();
  const [onglet, setOnglet] = useState<"lui" | "autre">(payeur ? "autre" : "lui");
  const [bc, setBc] = useState(bonCommande ?? "");
  const [adrClient, setAdrClient] = useState<Adresse>(adresseDe(client));
  const [choisi, setChoisi] = useState<Payeur | null>(payeur);
  const [adrPayeur, setAdrPayeur] = useState<Adresse>(adresseDe(payeur));
  const [recherche, setRecherche] = useState("");
  const [resultats, setResultats] = useState<Payeur[]>([]);
  const [nouveau, setNouveau] = useState(false);
  const [np, setNp] = useState({ type: "compte", societe: "", prenom: "", nom: "", email: "", telephone: "" });
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, lancer] = useTransition();

  useEffect(() => {
    if (onglet !== "autre" || nouveau) return;
    let vivant = true;
    const t = setTimeout(() => {
      chercherPayeurs(recherche, dossierId).then((r) => vivant && setResultats(r)).catch(() => vivant && setResultats([]));
    }, 220);
    return () => { vivant = false; clearTimeout(t); };
  }, [recherche, onglet, nouveau, dossierId]);

  const reprendre = (a: string | null, cible: "client" | "payeur") => {
    if (!a) return;
    const d = decouper(a);
    if (cible === "client") setAdrClient((x) => ({ ...x, ...d, pays: x.pays || "" }));
    else setAdrPayeur((x) => ({ ...x, ...d }));
  };

  function enregistrer() {
    setErreur(null);
    lancer(async () => {
      let r;
      if (onglet === "lui") {
        if (client.clientId) {
          r = await majAdresseFacturation(client.clientId, adrClient, dossierId);
          if (!r.ok) return setErreur(r.erreur);
        }
        r = await choisirPayeur(dossierId, null, bc);
      } else if (nouveau) {
        r = await creerPayeur(dossierId, { ...np, type: np.type as "compte", ...adrPayeur }, bc);
      } else {
        if (!choisi?.clientId) return setErreur("Choisissez le client qui paie, ou créez-le.");
        r = await majAdresseFacturation(choisi.clientId, adrPayeur, dossierId);
        if (!r.ok) return setErreur(r.erreur);
        r = await choisirPayeur(dossierId, choisi.clientId, bc);
      }
      if (!r.ok) setErreur(r.erreur);
      else onFermer();
    });
  }

  const formAdresse = (a: Adresse, set: (f: (x: Adresse) => Adresse) => void, cible: "client" | "payeur", pro: boolean) => (
    <div className={s.grille}>
      <Champ label="Adresse de facturation" l={12} id={`${id}-${cible}-adr`}>
        <ChampAdresse
          id={`${id}-${cible}-adr`}
          saisie="voie"
          value={a.adresse}
          onChange={(v) => set((x) => ({ ...x, adresse: v }))}
          onChoisir={(r) => set((x) => ({ ...x, adresse: r.voie, codePostal: r.codePostal, ville: r.ville, pays: "France" }))}
          placeholder="N°, rue, bâtiment"
        />
      </Champ>
      <Champ label="Code postal" l={3} id={`${id}-${cible}-cp`}>
        <input id={`${id}-${cible}-cp`} type="text" value={a.codePostal} onChange={(e) => set((x) => ({ ...x, codePostal: e.target.value }))} />
      </Champ>
      <Champ label="Ville" l={6} id={`${id}-${cible}-ville`}>
        <ChampAdresse
          id={`${id}-${cible}-ville`}
          mode="ville"
          value={a.ville}
          onChange={(v) => set((x) => ({ ...x, ville: v }))}
          onChoisir={(r) => set((x) => ({ ...x, ville: r.ville, codePostal: r.codePostal, pays: "France" }))}
        />
      </Champ>
      <Champ label="Pays" l={3} id={`${id}-${cible}-pays`}>
        <input id={`${id}-${cible}-pays`} type="text" value={a.pays} onChange={(e) => set((x) => ({ ...x, pays: e.target.value }))} placeholder="France" />
      </Champ>
      {pro && (
        <>
          <Champ label="SIREN" aide="client professionnel" l={6} id={`${id}-${cible}-siren`}>
            <input id={`${id}-${cible}-siren`} type="text" value={a.siren} onChange={(e) => set((x) => ({ ...x, siren: e.target.value }))} />
          </Champ>
          <Champ label="N° de TVA intracommunautaire" l={6} id={`${id}-${cible}-tva`}>
            <input id={`${id}-${cible}-tva`} type="text" value={a.tvaIntracom} onChange={(e) => set((x) => ({ ...x, tvaIntracom: e.target.value }))} />
          </Champ>
        </>
      )}
      <div style={{ gridColumn: "span 12", display: "flex", gap: 8, flexWrap: "wrap" }}>
        {adresses.depart && <button type="button" className={`${s.boutonFantome} ${s.petit}`} onClick={() => reprendre(adresses.depart, cible)}>Reprendre l&apos;adresse de départ</button>}
        {adresses.arrivee && <button type="button" className={`${s.boutonFantome} ${s.petit}`} onClick={() => reprendre(adresses.arrivee, cible)}>Reprendre l&apos;adresse d&apos;arrivée</button>}
      </div>
    </div>
  );

  return (
    <Fenetre
      surtitre="Client facturé"
      titre="Qui paie ce déménagement ?"
      sousTitre="Le client lui-même, ou un payeur distinct : un compte, une entreprise, un organisme."
      onFermer={onFermer}
      pied={
        <>
          <span className={s.resume}>Les factures déjà émises gardent leur payeur.</span>
          <span style={{ display: "flex", gap: 8 }}>
            <button type="button" className={s.boutonFantome} onClick={onFermer}>Annuler</button>
            <button type="button" className={s.bouton} onClick={enregistrer} disabled={enCours}>{enCours ? "Enregistrement…" : "Enregistrer"}</button>
          </span>
        </>
      }
    >
      {erreur && <p className={s.erreur} role="alert">{erreur}</p>}
      <div className={s.onglets} role="group" aria-label="Payeur">
        <button type="button" aria-pressed={onglet === "lui"} onClick={() => setOnglet("lui")}>Le client lui-même</button>
        <button type="button" aria-pressed={onglet === "autre"} onClick={() => setOnglet("autre")}>Un autre payeur</button>
      </div>

      {onglet === "lui" ? (
        <div className={s.bloc}>
          <p className={s.blocTitre}><i>1</i>{client.nom}</p>
          {formAdresse(adrClient, setAdrClient, "client", client.type === "compte" || client.type === "partenaire")}
        </div>
      ) : (
        <div className={s.bloc}>
          <p className={s.blocTitre} style={{ justifyContent: "space-between" }}>
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}><i>1</i>{nouveau ? "Nouveau payeur" : "Choisir le payeur"}</span>
            <button type="button" className={`${s.boutonDoux} ${s.petit}`} style={{ textTransform: "none", letterSpacing: 0 }} onClick={() => setNouveau((x) => !x)}>{nouveau ? "Chercher un client existant" : "+ Nouveau payeur"}</button>
          </p>
          {nouveau ? (
            <div className={s.grille}>
              <Champ label="Genre" l={6} id={`${id}-np-type`}>
                <select id={`${id}-np-type`} value={np.type} onChange={(e) => setNp({ ...np, type: e.target.value })}>{TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
              </Champ>
              <Champ label="Société" l={6} id={`${id}-np-societe`}>
                <input id={`${id}-np-societe`} type="text" value={np.societe} onChange={(e) => setNp({ ...np, societe: e.target.value })} />
              </Champ>
              <Champ label="Prénom du contact" l={4} id={`${id}-np-prenom`}>
                <input id={`${id}-np-prenom`} type="text" value={np.prenom} onChange={(e) => setNp({ ...np, prenom: e.target.value })} />
              </Champ>
              <Champ label="Nom du contact" l={4} id={`${id}-np-nom`}>
                <input id={`${id}-np-nom`} type="text" value={np.nom} onChange={(e) => setNp({ ...np, nom: e.target.value })} />
              </Champ>
              <Champ label="Téléphone" l={4} id={`${id}-np-tel`}>
                <input id={`${id}-np-tel`} type="tel" value={np.telephone} onChange={(e) => setNp({ ...np, telephone: e.target.value })} />
              </Champ>
              <Champ label="E-mail de facturation" l={12} id={`${id}-np-email`}>
                <input id={`${id}-np-email`} type="email" value={np.email} onChange={(e) => setNp({ ...np, email: e.target.value })} />
              </Champ>
            </div>
          ) : (
            <>
              <input type="text" aria-label="Rechercher un payeur" value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="Société, nom, e-mail ou SIREN" />
              <div className={s.resultats}>
                {resultats.length === 0 && <p className={s.vide}>Aucun client trouvé. Créez-le avec « Nouveau payeur ».</p>}
                {resultats.map((r) => (
                  <button key={r.clientId} type="button" className={s.resultat} aria-pressed={choisi?.clientId === r.clientId}
                    onClick={() => { setChoisi(r); setAdrPayeur(adresseDe(r)); }}>
                    <i>{initiales(r.nom) || "?"}</i>
                    <span><b>{r.nom}</b><small>{[r.contact, r.type === "compte" ? "Compte" : r.type === "partenaire" ? "Partenaire" : "Client", r.ville, r.siren && `SIREN ${r.siren}`].filter(Boolean).join(" · ")}</small></span>
                  </button>
                ))}
              </div>
            </>
          )}
          {(nouveau || choisi) && (
            <div className={s.bloc}>
              <p className={s.blocTitre}><i>2</i>Adresse de facturation {choisi && !nouveau ? `de ${choisi.nom}` : ""}</p>
              {formAdresse(adrPayeur, setAdrPayeur, "payeur", true)}
            </div>
          )}
        </div>
      )}
      <div className={s.bloc}>
        <div className={s.grille}>
          <Champ label="Bon de commande du compte" aide="repris sur les factures" l={12} id={`${id}-bc`}>
            <input id={`${id}-bc`} type="text" value={bc} onChange={(e) => setBc(e.target.value)} placeholder="Numéro du bon de commande" />
          </Champ>
        </div>
      </div>
    </Fenetre>
  );
}
