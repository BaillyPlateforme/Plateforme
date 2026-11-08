"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Icone } from "@/ui/icones";
import Formulaire from "@/crm/exploitation/ui/Formulaire";
import u from "@/crm/exploitation/ui/ui.module.css";
import { creerContrat } from "./actions";
import { deplier, PERIODICITES, plusMois, type Periodicite } from "./regles";
import s from "./garde-meuble.module.css";

/*
 * Le nouveau contrat de garde-meuble, en trois temps : le client (un dossier
 * du CRM, ou un simple nom pour une reprise), le contrat (début, périodicité,
 * loyer, prochaine échéance, assurance), puis les caisses une par une —
 * numéro, contenu, emplacement, photos facultatives. Les numéros se tapent
 * aussi d'une traite (« GM-0720 à GM-0725 ») et se déplient en lignes.
 *
 * Le loyer n'a pas de valeur par défaut. Si Bailly a donné un loyer par
 * caisse (réglage du module), il pré-remplit le loyer tant qu'on ne l'a pas
 * modifié à la main.
 */

type Dossier = { id: number; ref: string; client: string; statut: string; garde_meuble: boolean };
type Ligne = { cle: number; numero: string; contenu: string; emplacement: string; apercus: string[] };

const eur = (n: number) => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 2 }).format(n);
const jourFr = (v: string) => (v ? new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${v}T00:00:00Z`)) : "—");

export default function FormulaireContrat({
  dossiers,
  dossierInitial,
  loyerCaisse,
  aujourdhui,
}: {
  dossiers: Dossier[];
  dossierInitial: number | null;
  /** Le réglage « loyer mensuel d'une caisse », ou null (vide). */
  loyerCaisse: number | null;
  aujourdhui: string;
}) {
  const [dossier, setDossier] = useState<string>(dossierInitial ? String(dossierInitial) : "");
  const choisi = dossiers.find((d) => String(d.id) === dossier) ?? null;
  const [client, setClient] = useState(choisi?.client ?? "");
  const [clientTouche, setClientTouche] = useState(false);
  const [debut, setDebut] = useState(aujourdhui);
  const [periodicite, setPeriodicite] = useState<Periodicite>("mensuelle");
  const [echeance, setEcheance] = useState("");
  const [echeanceTouchee, setEcheanceTouchee] = useState(false);
  const [loyer, setLoyer] = useState("");
  const [loyerTouche, setLoyerTouche] = useState(false);
  const [lignes, setLignes] = useState<Ligne[]>([{ cle: 0, numero: "", contenu: "", emplacement: "", apercus: [] }]);
  const [saisieNumeros, setSaisieNumeros] = useState("");
  const cle = useRef(1);

  // L'échéance proposée : une période après le début, tant qu'on ne l'a pas changée.
  const echeanceProposee = debut ? plusMois(debut, PERIODICITES[periodicite].mois) : "";
  const echeanceAffichee = echeanceTouchee ? echeance : echeanceProposee;
  const caisses = lignes.filter((l) => l.numero.trim()).length;
  const loyerPropose = loyerCaisse && caisses ? String(Math.round(loyerCaisse * caisses * 100) / 100) : "";
  const loyerAffiche = loyerTouche ? loyer : loyerPropose;
  const montant = Number(loyerAffiche.replace(",", ".")) * PERIODICITES[periodicite].mois;

  // Les aperçus des photos sont libérés quand le formulaire disparaît.
  const apercus = useRef<string[]>([]);
  useEffect(() => () => apercus.current.forEach((x) => URL.revokeObjectURL(x)), []);

  const doublons = useMemo(() => {
    const vus = new Set<string>();
    const d = new Set<string>();
    for (const l of lignes) {
      const n = l.numero.trim().toLowerCase();
      if (!n) continue;
      if (vus.has(n)) d.add(n);
      vus.add(n);
    }
    return d;
  }, [lignes]);

  const ajouterLignes = (numeros: string[]) => {
    const nouvelles = numeros.map((numero) => ({ cle: cle.current++, numero, contenu: "", emplacement: "", apercus: [] }));
    setLignes((ls) => [...ls.filter((l) => l.numero.trim() || l.contenu.trim() || l.apercus.length), ...nouvelles]);
  };
  const maj = (k: number, champ: keyof Omit<Ligne, "cle" | "apercus">, v: string) => setLignes((ls) => ls.map((l) => (l.cle === k ? { ...l, [champ]: v } : l)));

  return (
    <Formulaire action={creerContrat} className={s.creation}>
      <div className={u.pile}>
        <section className={u.carte}>
          <div className={u.bloc}>
            <p className={u.blocTitre}>
              <i>1</i>Le client
            </p>
            <div className={u.champs}>
              <div className={`${u.champ} ${u.w6}`}>
                <label htmlFor="gm-dossier">Dossier du CRM</label>
                <select
                  id="gm-dossier"
                  name="dossier_id"
                  value={dossier}
                  onChange={(e) => {
                    setDossier(e.target.value);
                    const d = dossiers.find((x) => String(x.id) === e.target.value);
                    if (!clientTouche) setClient(d?.client ?? "");
                  }}
                >
                  <option value="">Sans dossier (reprise d&apos;un contrat existant)</option>
                  {dossiers.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.ref} · {d.client}
                      {d.garde_meuble ? " · étape garde-meuble" : ""}
                    </option>
                  ))}
                </select>
                <p className={u.aide}>Les dossiers dont le trajet passe par le garde-meuble sont proposés en premier.</p>
              </div>
              <div className={`${u.champ} ${u.w6}`}>
                <label htmlFor="gm-client">
                  Nom sur le contrat {!dossier && <em>*</em>}
                </label>
                <input
                  id="gm-client"
                  type="text"
                  name="client"
                  value={client}
                  onChange={(e) => {
                    setClient(e.target.value);
                    setClientTouche(true);
                  }}
                  required={!dossier}
                  placeholder={choisi ? choisi.client : "Nom du client ou de la société"}
                />
                <p className={u.aide}>{choisi ? "Repris du dossier ; modifiable (stockage au nom d'une société…)." : "Le contrat peut vivre sans dossier."}</p>
              </div>
            </div>
          </div>

          <div className={u.bloc}>
            <p className={u.blocTitre}>
              <i>2</i>Le contrat
            </p>
            <div className={u.champs}>
              <div className={`${u.champ} ${u.w4}`}>
                <label htmlFor="gm-debut">
                  Début <em>*</em>
                </label>
                <input id="gm-debut" type="date" name="debut" value={debut} onChange={(e) => setDebut(e.target.value)} required />
              </div>
              <div className={`${u.champ} ${u.w4}`}>
                <span className={u.etiquette}>Périodicité de facturation</span>
                <div className={u.segments} role="radiogroup" aria-label="Périodicité">
                  {Object.entries(PERIODICITES).map(([k, v]) => (
                    <label key={k}>
                      <input type="radio" name="periodicite" value={k} checked={periodicite === k} onChange={() => setPeriodicite(k as Periodicite)} />
                      {v.libelle}
                    </label>
                  ))}
                </div>
              </div>
              <div className={`${u.champ} ${u.w4}`}>
                <label htmlFor="gm-echeance">Première échéance</label>
                <input
                  id="gm-echeance"
                  type="date"
                  name="echeance"
                  value={echeanceAffichee}
                  min={debut || undefined}
                  onChange={(e) => {
                    setEcheance(e.target.value);
                    setEcheanceTouchee(true);
                  }}
                />
                <p className={u.aide}>Proposée une période après le début ; puis une période après chaque facture.</p>
              </div>
              <div className={`${u.champ} ${u.w4}`}>
                <label htmlFor="gm-loyer">
                  Loyer mensuel (€) <em>*</em>
                </label>
                <input
                  id="gm-loyer"
                  type="number"
                  name="loyer"
                  min={0}
                  step="0.01"
                  value={loyerAffiche}
                  onChange={(e) => {
                    setLoyer(e.target.value);
                    setLoyerTouche(true);
                  }}
                  required
                  placeholder="À saisir"
                />
                <p className={u.aide}>
                  {loyerCaisse
                    ? `Pré-rempli : ${eur(loyerCaisse)} par caisse et par mois (réglage du module).`
                    : "Aucun tarif par caisse n'est réglé : saisissez le loyer du contrat."}
                </p>
              </div>
              <div className={`${u.champ} ${u.w4}`}>
                <span className={u.etiquette}>Assurance</span>
                <div className={u.segments} role="radiogroup" aria-label="Assurance">
                  <label>
                    <input type="radio" name="assurance" value="oui" defaultChecked />
                    Assuré
                  </label>
                  <label>
                    <input type="radio" name="assurance" value="non" />
                    Non assuré
                  </label>
                </div>
              </div>
              <div className={`${u.champ} ${u.w12}`}>
                <label htmlFor="gm-notes">Notes</label>
                <textarea id="gm-notes" name="notes" placeholder="Accès au box, objets hors caisses, consignes du client…" />
              </div>
            </div>
          </div>

          <div className={u.bloc}>
            <p className={u.blocTitre}>
              <i>3</i>Les caisses <small>{caisses ? `${caisses} caisse${caisses > 1 ? "s" : ""}` : "aucune pour l'instant"}</small>
            </p>
            <div className={s.generateur}>
              <div className={u.champ} style={{ gridColumn: "auto", flex: 1 }}>
                <label htmlFor="gm-numeros">Saisir plusieurs numéros d&apos;un coup</label>
                <input
                  id="gm-numeros"
                  type="text"
                  value={saisieNumeros}
                  onChange={(e) => setSaisieNumeros(e.target.value)}
                  placeholder="GM-0720 à GM-0725, GM-0730"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      const n = deplier(saisieNumeros);
                      if (n.length) {
                        ajouterLignes(n);
                        setSaisieNumeros("");
                      }
                    }
                  }}
                />
              </div>
              <button
                type="button"
                className={u.bouton}
                data-ton="discret"
                disabled={!deplier(saisieNumeros).length}
                onClick={() => {
                  ajouterLignes(deplier(saisieNumeros));
                  setSaisieNumeros("");
                }}
              >
                {deplier(saisieNumeros).length > 1 ? `Créer ${deplier(saisieNumeros).length} lignes` : "Créer la ligne"}
              </button>
            </div>

            <ol className={s.lignes}>
              {lignes.map((l, i) => (
                <li key={l.cle} className={s.ligne} data-doublon={doublons.has(l.numero.trim().toLowerCase()) || undefined}>
                  <span className={s.rang}>{i + 1}</span>
                  <div className={u.champ} style={{ gridColumn: "auto" }}>
                    <label htmlFor={`c${l.cle}-numero`}>Numéro</label>
                    <input id={`c${l.cle}-numero`} type="text" name={`caisse_${l.cle}_numero`} value={l.numero} onChange={(e) => maj(l.cle, "numero", e.target.value)} placeholder="GM-0720" />
                  </div>
                  <div className={u.champ} style={{ gridColumn: "auto" }}>
                    <label htmlFor={`c${l.cle}-contenu`}>Contenu</label>
                    <input id={`c${l.cle}-contenu`} type="text" name={`caisse_${l.cle}_contenu`} value={l.contenu} onChange={(e) => maj(l.cle, "contenu", e.target.value)} placeholder="Facultatif" />
                  </div>
                  <div className={u.champ} style={{ gridColumn: "auto" }}>
                    <label htmlFor={`c${l.cle}-emplacement`}>Emplacement</label>
                    <input id={`c${l.cle}-emplacement`} type="text" name={`caisse_${l.cle}_emplacement`} value={l.emplacement} onChange={(e) => maj(l.cle, "emplacement", e.target.value)} placeholder="Allée, rang…" />
                  </div>
                  <label className={s.photos} title="Photos facultatives de la caisse">
                    <input
                      type="file"
                      name={`caisse_${l.cle}_photos`}
                      accept="image/*"
                      multiple
                      onChange={(e) => {
                        const urls = [...(e.target.files ?? [])].slice(0, 12).map((f) => URL.createObjectURL(f));
                        apercus.current.push(...urls);
                        setLignes((ls) => ls.map((x) => (x.cle === l.cle ? { ...x, apercus: urls } : x)));
                      }}
                    />
                    {l.apercus.length ? (
                      <span className={s.vignettes}>
                        {l.apercus.slice(0, 3).map((a) => (
                          // eslint-disable-next-line @next/next/no-img-element -- aperçu local d'un fichier choisi
                          <img key={a} src={a} alt="" />
                        ))}
                        {l.apercus.length > 3 && <em>+{l.apercus.length - 3}</em>}
                      </span>
                    ) : (
                      <>
                        <Icone nom="plus" taille={15} />
                        Photos
                      </>
                    )}
                  </label>
                  <button type="button" className={s.retirer} aria-label={`Retirer la ligne ${i + 1}`} onClick={() => setLignes((ls) => (ls.length > 1 ? ls.filter((x) => x.cle !== l.cle) : [{ ...ls[0], numero: "", contenu: "", emplacement: "", apercus: [] }]))}>
                    <Icone nom="plus" taille={16} />
                  </button>
                </li>
              ))}
            </ol>
            <button type="button" className={`${u.bouton} ${u.petit}`} data-ton="secondaire" onClick={() => ajouterLignes([""])} style={{ justifySelf: "start" }}>
              <Icone nom="plus" taille={15} />
              Ajouter une caisse
            </button>
            {doublons.size > 0 && <p className={u.erreur}>Un numéro de caisse est saisi deux fois.</p>}
          </div>
        </section>
      </div>

      <aside className={s.recap}>
        <p className={u.surtitre}>Récapitulatif</p>
        <h3>{client || choisi?.client || "Client à choisir"}</h3>
        {choisi && <p className={s.recapRef}>Dossier {choisi.ref}</p>}
        <dl>
          <div>
            <dt>Caisses</dt>
            <dd>{caisses || "—"}</dd>
          </div>
          <div>
            <dt>Loyer mensuel</dt>
            <dd>{loyerAffiche ? eur(Number(loyerAffiche.replace(",", "."))) : "À saisir"}</dd>
          </div>
          <div>
            <dt>Facture {PERIODICITES[periodicite].libelle.toLowerCase()}</dt>
            <dd>{loyerAffiche && Number.isFinite(montant) ? eur(montant) : "—"}</dd>
          </div>
          <div>
            <dt>Début</dt>
            <dd>{jourFr(debut)}</dd>
          </div>
          <div>
            <dt>Première échéance</dt>
            <dd>{jourFr(echeanceAffichee)}</dd>
          </div>
        </dl>
        <button type="submit" className={u.bouton} style={{ width: "100%" }} disabled={doublons.size > 0}>
          Créer le contrat
          <Icone nom="fleche" taille={17} />
        </button>
        <p className={u.aide}>Le contrat rejoint la liste du garde-meuble, où il passe « À facturer » à chaque échéance.</p>
      </aside>
    </Formulaire>
  );
}
