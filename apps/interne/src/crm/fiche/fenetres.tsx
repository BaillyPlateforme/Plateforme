import Link from "next/link";
import ChoixMois from "@/crm/components/ChoixMois";
import type { Row } from "@/crm/lib/db";
import * as A from "@/crm/actions";
import * as B from "@/crm/actions2";
import { emballages } from "@/crm/lib/tarif";
import { dateFr, eur, m3, TYPES } from "@/crm/lib/format";
import { commencerVisite } from "@/crm/visites/actions";
import ChampPrestataire from "@/crm/partenaires/ChampPrestataire";
import ChampAdresse from "@/ui/ChampAdresse";
import LienStreetView from "@/ui/LienStreetView";
import ChampsTelephones from "@/crm/clients/ChampsTelephones";
import { telephonesDuClient } from "@/crm/clients/telephones";
import { ACCES_ESCALIER, ACCES_MONTE_MEUBLE, ACCES_POIDS_LOURD, ACCES_STATIONNEMENT, GENRE_ETAPE, designation } from "@/lib/visite/regles";
import { DESTINATIONS_SPECIALES, bilanVolumes, estSpeciale } from "@/lib/visite/destinations";
import { DEPARTEMENTS_OM, GROUPES_OM, SITUATIONS_FAMILLE } from "@/crm/cimob/commun";
import { casePortVisible, kilometresDuDossier, lignesKilometres, portsDuTrajet } from "@/crm/creation/kilometres";
import ListePorts from "@/crm/creation/ListePorts";
import * as F from "./actions";
import { Valider } from "./Fiche";
import { Picto } from "./Picto";
import s from "./fiche.module.css";

/*
 * Les fenêtres de la fiche, comme celles de Créagidem : « Fiche » (l'identité
 * du client), « Adresses et accès » (la fenêtre de visite), « Inventaire »,
 * « Suivi » (commercial, observations), et celles d'une ligne (une lettre de
 * voiture, un contact, un service, un litige…). Rendues par le serveur,
 * branchées sur les actions du CRM ; Fiche.tsx les ouvre et les referme.
 */

const iso = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString().slice(0, 10) : "");
// Les destinations hors adresse de la tablette (Dragan, 18/11/2026) s'y ajoutent : « À laisser sur place » et
// « Pris en charge par le client » sortent du volume transporté, celui du dossier (visites/volume.ts).
const DESTINATIONS = ["Arrivée", "Garde-meuble", "Don", "Déchetterie", "Autre adresse", ...DESTINATIONS_SPECIALES.map((x) => x.libelle)];
const LV_ST: Record<string, string> = { a_planifier: "À planifier", planifiee: "Planifiée", en_cours: "En cours", livree: "Livrée" };

/** Un champ de formulaire : son libellé au-dessus, sa largeur sur la grille de 12. */
function Champ({ l = 6, titre, aide, children }: { l?: 2 | 3 | 4 | 6 | 8 | 12; titre: string; aide?: string; children: React.ReactNode }) {
  return (
    <label className={s.champ} data-l={l}>
      <span>
        {titre}
        {aide && <small> · {aide}</small>}
      </span>
      {children}
    </label>
  );
}

/** « Fiche » : l'identité du client, reprise du formulaire de l'ancienne fiche (ses téléphones), et les droits d'un CIMOB/DICOM. */
export function FenetreIdentite({ d, espaceOuvert, entreprises = [] }: { d: Row; espaceOuvert: boolean; entreprises?: { id: string; nom: string; actif: boolean }[] }) {
  return (
    <form action={F.majIdentite.bind(null, d.id)}>
      <div className={s.grille}>
        <Champ l={2} titre="Civilité">
          <select name="client_civilite" defaultValue={d.civilite ?? ""}>
            <option value="">—</option>
            <option>Madame</option>
            <option>Monsieur</option>
          </select>
        </Champ>
        <Champ l={4} titre="Prénom">
          <input type="text" name="client_prenom" defaultValue={d.prenom ?? ""} />
        </Champ>
        <Champ l={6} titre="Nom">
          <input type="text" name="client_nom" defaultValue={d.nom ?? ""} required />
        </Champ>
        <Champ l={6} titre="Société">
          <input type="text" name="client_societe" defaultValue={d.societe ?? ""} placeholder="Pour un compte ou un partenaire" />
        </Champ>
        <Champ l={6} titre="Type de client">
          <select name="type_client" defaultValue={d.type}>
            {Object.entries(TYPES).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Champ>
        {/* Plusieurs téléphones, chacun avec ce qu'il désigne (retours de Céline, 16/11/2026) : le premier reçoit les SMS. */}
        <div className={s.champ} data-l={12}>
          <span>
            Téléphones
            <small> · le premier reçoit les SMS du dossier</small>
          </span>
          <ChampsTelephones initial={telephonesDuClient(d)} />
        </div>
        {(d.type === "militaire" || d.volume_droits != null) && (
          <Champ l={6} titre="Droits (m³)" aide="CIMOB/DICOM : volume accordé par l'administration">
            <input type="text" inputMode="decimal" name="volume_droits" defaultValue={d.volume_droits != null ? String(Number(d.volume_droits)).replace(".", ",") : ""} />
          </Champ>
        )}
        {/* CIMOB/DICOM (Céline, 17/11/2026) : le matricule, que la recherche retrouve, et la situation de famille. */}
        {(d.type === "militaire" || d.matricule || d.situation_famille) && (
          <>
            <Champ l={6} titre="Matricule">
              <input type="text" name="client_matricule" defaultValue={d.matricule ?? ""} maxLength={40} spellCheck={false} />
            </Champ>
            <Champ l={6} titre="Situation de famille">
              <select name="client_situation_famille" defaultValue={d.situation_famille ?? ""}>
                <option value="">À préciser</option>
                {Object.entries(SITUATIONS_FAMILLE).map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </select>
            </Champ>
          </>
        )}
        <Champ l={entreprises.length ? 6 : 12} titre="E-mail" aide={espaceOuvert ? "identifiant de l'espace client : il se modifie depuis l'espace" : undefined}>
          <input type="email" name="client_email" defaultValue={d.email ?? ""} readOnly={espaceOuvert} />
        </Champ>
        {/* Le rattachement du client à une entreprise : ses dossiers paraissent dans l'espace RH de celle-ci. Sans la liste, pas de champ. */}
        {entreprises.length > 0 && (
          <Champ l={6} titre="Entreprise (espace pro)" aide="ouvre ses dossiers à l'espace RH">
            <select name="espace_pro_id" defaultValue={d.espace_pro_id ?? ""}>
              <option value="">Aucune</option>
              {entreprises.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nom}
                  {e.actif ? "" : " (espace en pause)"}
                </option>
              ))}
            </select>
          </Champ>
        )}
      </div>
      <div className={s.pied}>
        <p>
          <Link href={`/clients/${d.client_id}`}>Client n° {d.client_id}</Link> · dossier {d.ref}
        </p>
        <Valider>Enregistrer la fiche</Valider>
      </div>
    </form>
  );
}

/** « Suivi » : le commercial, qui traite le dossier, les observations et les deux cases de l'ancienne fiche. */
export function FenetreSuivi({ d, utilisateurs }: { d: Row; utilisateurs: Row[] }) {
  return (
    <form action={F.majSuivi.bind(null, d.id)}>
      <div className={s.grille}>
        <Champ titre="Commercial">
          <select name="commercial_id" defaultValue={d.commercial_id ?? ""}>
            <option value="">—</option>
            {utilisateurs
              .filter((u) => u.role === "commercial")
              .map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nom}
                </option>
              ))}
          </select>
        </Champ>
        <Champ titre="Dossier traité par">
          <select name="traite_par_id" defaultValue={d.traite_par_id ?? ""}>
            <option value="">—</option>
            {utilisateurs.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nom}
              </option>
            ))}
          </select>
        </Champ>
        <Champ l={12} titre="Observations commerciales">
          <textarea name="observations" defaultValue={d.observations ?? ""} style={{ minHeight: 170 }} placeholder="Concurrents déjà vus, code portail, instructions du téléphone…" />
        </Champ>
        <label className={s.case}>
          <input type="checkbox" name="passer_en_dernier" defaultChecked={d.passer_en_dernier} />
          Passer en dernier (le client consulte déjà des concurrents) : signalé sur le planning
        </label>
        <label className={s.case}>
          <input type="checkbox" name="vehicule" defaultChecked={d.vehicule} />
          Transporte un véhicule (carte grise + attestation d’assurance à demander)
        </label>
      </div>
      <div className={s.pied}>
        <Valider>Enregistrer</Valider>
      </div>
    </form>
  );
}

/**
 * « Adresses et accès » : la fenêtre de visite de Créagidem, sur la fiche.
 * Chaque adresse avec son code postal, sa ville, son pays et un téléphone,
 * puis les accès — tous les champs du module des visites —, une étape de
 * plus ou de moins, et la période.
 */
export function FenetreAdresses({ d }: { d: Row }) {
  const moisCa = d.mois_ca ? new Date(d.mois_ca).toISOString().slice(0, 7) : "";
  // CIMOB/DICOM (Céline, 17/11/2026 : « IMPÉRATIF ») : le département d'outre-mer de chaque adresse.
  const outreMer = d.type === "militaire" || d.stops.some((x: Row) => x.departement_om);
  // La case Port des chargements et des livraisons (Céline, 18/11/2026) : toujours pour un CIMOB/DICOM, dès qu'une
  // adresse est outre-mer ou à l'étranger, et toujours quand une case est remplie (crm/creation/kilometres.ts).
  const ports = casePortVisible(d.type === "militaire", d.stops);
  const avecPort = (e: Row) => ports && (e.genre === "depart" || e.genre === "arrivee");
  // Un chargement ou une livraison de plus se retire ; le seul départ, la seule arrivée, jamais.
  const nombre = (genre: string) => d.stops.filter((x: Row) => x.genre === genre).length;
  const distances = lignesKilometres(kilometresDuDossier(d), portsDuTrajet(d.stops));
  return (
    <form action={F.majItineraire.bind(null, d.id)}>
      {ports && <ListePorts id="ports-fiche" />}
      {d.stops.map((e: Row, i: number) => (
        <fieldset key={e.id} className={s.etape}>
          <legend>
            <i>{i + 1}</i>
            {GENRE_ETAPE[e.genre] ?? "Étape"}
            {(["autre", "garde_meuble"].includes(e.genre) || (["depart", "arrivee"].includes(e.genre) && nombre(e.genre) > 1)) && (
              <button name="retirer" value={e.id} data-garder="" title="Retirer cette étape">
                Retirer
              </button>
            )}
            {/* Street View sur cette adresse (retours de Céline, 16/11/2026) : un lien vers Google Maps, sans clé. */}
            {e.adresse && <LienStreetView adresse={[e.adresse, e.code_postal && !String(e.adresse).includes(e.code_postal) ? e.code_postal : null, e.ville && !String(e.adresse).toLowerCase().includes(String(e.ville).toLowerCase()) ? e.ville : null].filter(Boolean).join(" ")} />}
          </legend>
          <div className={s.grille}>
            <Champ l={6} titre="Adresse">
              <ChampAdresse
                name={`adresse_${e.id}`}
                defaultValue={e.adresse ?? ""}
                placeholder="Numéro et rue"
                remplir={{ codePostal: `code_postal_${e.id}`, ville: `ville_${e.id}`, pays: `pays_${e.id}` }}
              />
            </Champ>
            <Champ l={2} titre="Code postal">
              <input type="text" name={`code_postal_${e.id}`} defaultValue={e.code_postal ?? ""} inputMode="numeric" />
            </Champ>
            <Champ l={4} titre="Ville">
              <ChampAdresse mode="ville" name={`ville_${e.id}`} defaultValue={e.ville ?? ""} remplir={{ codePostal: `code_postal_${e.id}`, pays: `pays_${e.id}` }} />
            </Champ>
            <Champ l={3} titre="Pays">
              <input type="text" name={`pays_${e.id}`} defaultValue={e.pays ?? ""} placeholder="France" />
            </Champ>
            <Champ l={3} titre="Téléphone sur place">
              <input name={`telephone_${e.id}`} defaultValue={e.telephone ?? ""} type="tel" />
            </Champ>
            <Champ l={2} titre="Étage">
              <input type="text" name={`etage_${e.id}`} defaultValue={e.etage ?? ""} placeholder="RDC, 3…" />
            </Champ>
            <Champ l={2} titre="Portage (m)">
              <input type="text" name={`portage_${e.id}`} defaultValue={e.portage_m ?? ""} inputMode="numeric" />
            </Champ>
            <Champ l={2} titre="Escalier">
              <select name={`escalier_${e.id}`} defaultValue={e.escalier ?? ""}>
                <option value="">—</option>
                {Object.entries(ACCES_ESCALIER).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </Champ>
            <Champ l={4} titre="Monte-meubles">
              <select name={`monte_meuble_${e.id}`} defaultValue={e.monte_meuble ?? ""}>
                <option value="">—</option>
                {Object.entries(ACCES_MONTE_MEUBLE).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </Champ>
            <Champ l={4} titre="Accès poids lourd">
              <select name={`poids_lourd_${e.id}`} defaultValue={e.poids_lourd ?? ""}>
                <option value="">—</option>
                {Object.entries(ACCES_POIDS_LOURD).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </Champ>
            <Champ l={8} titre="Stationnement">
              <select name={`stationnement_${e.id}`} defaultValue={e.stationnement ?? ""}>
                <option value="">—</option>
                {Object.entries(ACCES_STATIONNEMENT).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </Champ>
            <div className={s.cases}>
              <label className={s.case}>
                <input type="checkbox" name={`ascenseur_${e.id}`} defaultChecked={e.ascenseur} />
                Ascenseur
              </label>
              <label className={s.case}>
                <input type="checkbox" name={`monte_charge_${e.id}`} defaultChecked={e.monte_charge} />
                Monte-charge
              </label>
              <label className={s.case}>
                <input type="checkbox" name={`transbordement_${e.id}`} defaultChecked={e.transbordement} />
                Transbordement
              </label>
            </div>
            {/* La fiche du premier appel (retours de Céline, 16/11/2026) : ce que l'écran de création note dès l'appel. */}
            <Champ l={3} titre="Taille de l’ascenseur" aide="personnes">
              <input type="text" name={`ascenseur_taille_${e.id}`} defaultValue={e.ascenseur_taille ?? ""} />
            </Champ>
            <Champ l={3} titre="Portage">
              <select name={`portage_oui_${e.id}`} defaultValue={e.portage ? "on" : ""}>
                <option value="">Non</option>
                <option value="on">Oui</option>
              </select>
            </Champ>
            <Champ l={e.genre === "depart" ? 4 : 6} titre="Code d’accès">
              <input type="text" name={`code_acces_${e.id}`} defaultValue={e.code_acces ?? ""} placeholder="Codes, interphone…" />
            </Champ>
            {e.genre === "depart" && (
              <Champ l={2} titre="Surface (m²)">
                <input type="text" name={`surface_m2_${e.id}`} defaultValue={e.surface_m2 ?? ""} inputMode="numeric" />
              </Champ>
            )}
            <Champ l={(12 - (outreMer && e.genre !== "garde_meuble" ? 4 : 0) - (avecPort(e) ? 4 : 0)) as 4 | 8 | 12} titre="Accès en camion">
              <input type="text" name={`acces_camion_${e.id}`} defaultValue={e.acces_camion ?? ""} />
            </Champ>
            {avecPort(e) && (
              <Champ l={4} titre="Port">
                <input type="text" name={`port_${e.id}`} defaultValue={e.port ?? ""} list="ports-fiche" autoComplete="off" placeholder={e.genre === "depart" ? "Port de départ" : "Port d’arrivée"} />
              </Champ>
            )}
            {outreMer && e.genre !== "garde_meuble" && (
              <Champ l={4} titre="Département d’outre-mer">
                <select name={`departement_om_${e.id}`} defaultValue={e.departement_om ?? ""}>
                  <option value="">Aucun</option>
                  {GROUPES_OM.map((g) => (
                    <optgroup key={g.libelle} label={g.libelle}>
                      {g.codes.map((code) => (
                        <option key={code} value={code}>
                          {code} · {DEPARTEMENTS_OM[code]}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </Champ>
            )}
            <Champ l={12} titre="Précisions d’accès">
              <input type="text" name={`acces_${e.id}`} defaultValue={e.acces ?? ""} placeholder="Code portail, cour intérieure, horaires de la rue…" />
            </Champ>
          </div>
        </fieldset>
      ))}
      <div className={s.grille}>
        <p className={s.intertitre}>Période</p>
        <Champ l={4} titre="Période souhaitée">
          <input type="text" name="periode" defaultValue={d.periode ?? ""} placeholder="Fin janvier 2027" />
        </Champ>
        <Champ l={4} titre="Mois de rattachement du CA">
          <ChoixMois name="mois_ca" defaultValue={moisCa} ariaLabel="Mois de rattachement du CA" />
        </Champ>
        <Champ l={4} titre="Date ferme">
          <input
            type="text"
            readOnly
            value={d.date_chargement ? dateFr(d.date_chargement, { day: "numeric", month: "long", year: "numeric" }) : "Pas de date : voir Planification"}
          />
        </Champ>
      </div>
      <div className={s.pied}>
        <p>
          {/* Par la mer (Céline, 18/11/2026) : la route jusqu'au port, la mer à vol d'oiseau, la route depuis le port, l'une sous l'autre. */}
          {distances.length > 0 ? (
            <span className={s.distances}>
              {distances.map((l) => (
                <b key={l}>{l}</b>
              ))}
            </span>
          ) : (
            d.distance_km != null && <b>{Number(d.distance_km).toLocaleString("fr-FR")} km par la route · </b>
          )}
          Les adresses servent aussi au devis, aux lettres de voiture et à l’espace du client.
        </p>
        <Valider garder nom="ajouter" valeur="depart" ton="doux">
          + Chargement
        </Valider>
        <Valider garder nom="ajouter" valeur="arrivee" ton="doux">
          + Livraison
        </Valider>
        <Valider garder nom="ajouter" valeur="1" ton="doux">
          + Ajouter une étape
        </Valider>
        <Valider>Enregistrer les adresses</Valider>
      </div>
    </form>
  );
}

/** « Inventaire » : l'inventaire de l'ancienne fiche, pièce par pièce, et ses emballages. */
export function FenetreInventaire({ d }: { d: Row }) {
  const id = d.id as number;
  const pieces = [...new Set(d.inv.map((i: Row) => i.piece))] as string[];
  const emb = emballages(d.volume);
  // Le volume du dossier est le volume transporté : ce qui reste sur place (ou que le client emporte) se lit à part.
  const bilan = bilanVolumes((d.inv as Row[]).map((i) => ({ quantite: i.quantite, volume: i.volume, speciale: estSpeciale(i.destination_speciale) ? i.destination_speciale : null })));
  return (
    <div>
      <div className={s.actionsDetail} style={{ marginTop: 0, marginBottom: 14 }}>
        <span className="seg modes">
          <button type="button" className="on">
            Manuel
          </button>
          <button type="button" className="mode-off" disabled title="Sur la tablette de visite">
            Photo
          </button>
          <button type="button" className="mode-off" disabled title="Sur la tablette de visite">
            Dictée vocale
          </button>
        </span>
        <form action={commencerVisite.bind(null, id, null)}>
          <button className="btn ghost sm">
            <Picto nom="tablette" taille={15} />
            Saisir sur la tablette
          </button>
        </form>
        <b style={{ marginLeft: "auto", fontSize: 15 }} title="Volume transporté : celui du dossier et du devis">
          {m3(d.volume)}
          {bilan.nonTransporte > 0 && <small style={{ fontWeight: 600, color: "#8a7a4a" }}> transportés · {m3(bilan.nonTransporte)} non transportés</small>}
        </b>
      </div>
      {d.inv.length === 0 && <div className={s.vide}>Aucun objet. Ajoutez les meubles vus pendant la visite.</div>}
      <div className={s.pieces}>
        {pieces.map((p) => (
          <div className={s.piece} key={p}>
            <h5>
              {p}
              <small>{m3(d.inv.filter((i: Row) => i.piece === p).reduce((a: number, i: Row) => a + i.volume * i.quantite, 0))}</small>
            </h5>
            {d.inv
              .filter((i: Row) => i.piece === p)
              .map((i: Row) => (
                <div className={s.objet} key={i.id}>
                  <span>
                    {i.quantite > 1 ? `${i.quantite} × ` : ""}
                    {designation(i.libelle, i.libelle_en)}
                  </span>
                  <span className={s.dest}>{i.destination}</span>
                  <form action={A.basculerDemontage.bind(null, id, i.id)} data-garder="">
                    <button className={s.mini} data-on={i.demontage} title="Démontage">
                      Démont.
                    </button>
                  </form>
                  <b>{m3(i.volume * i.quantite)}</b>
                  <form action={A.supprimerObjet.bind(null, id, i.id)} data-garder="">
                    <button className={`${s.mini} ${s.x}`} title="Supprimer" aria-label={`Supprimer ${i.libelle}`}>
                      ×
                    </button>
                  </form>
                </div>
              ))}
          </div>
        ))}
      </div>
      <form action={A.ajouterObjet.bind(null, id)} className={s.ajout} data-garder="">
        <input type="text" name="piece" placeholder="Pièce" list="fiche-pieces" required aria-label="Pièce" />
        <input type="text" name="libelle" placeholder="Objet (ex. Canapé 3 places)" required aria-label="Objet" />
        <input type="number" name="quantite" defaultValue={1} min={1} title="Quantité" aria-label="Quantité" />
        <input type="text" inputMode="decimal" name="volume" pattern="[0-9]+([.,][0-9]+)?" placeholder="m³" required title="Volume unitaire, en m³ (0,5 ou 0.5)" aria-label="Volume unitaire" />
        <select name="destination" aria-label="Destination">
          {DESTINATIONS.map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>
        <label className={s.case} style={{ gridColumn: "auto" }}>
          <input type="checkbox" name="demontage" />
          Démont.
        </label>
        <Valider garder>Ajouter</Valider>
        <datalist id="fiche-pieces">
          <option>Salon</option>
          <option>Cuisine</option>
          <option>Chambre</option>
          <option>Bureau</option>
          <option>Cave / box</option>
          <option>Garage</option>
        </datalist>
      </form>
      <div className={s.emballages}>
        <Picto nom="inventaire" taille={17} />
        <span>
          <b>{emb.cartonsStandard}</b> cartons standard
        </span>
        <span>
          <b>{emb.cartonsLivres}</b> cartons livres
        </span>
        <span>
          <b>{emb.penderies}</b> penderies
        </span>
        <span>
          <b>{emb.bulle}</b> rouleaux bulle
        </span>
        <small style={{ flexBasis: "100%", color: "#8a7a4a" }}>Règle appliquée : paquets de 20 · repris sur la fiche imprimée et le devis</small>
      </div>
      <div className={s.pied}>
        <p>Le volume du dossier suit l’inventaire : c’est le volume transporté, sans ce qui est laissé sur place ni pris en charge par le client.</p>
      </div>
    </div>
  );
}

/** La fenêtre d'une lettre de voiture : trajet, dates, prestataire, équipe, camion, consignes, statut. */
export function FenetreLettre({ d, l }: { d: Row; l: Row }) {
  return (
    <form action={F.modifierLettre.bind(null, d.id, l.id)}>
      <div className={s.grille}>
        <Champ l={12} titre="Trajet">
          <input type="text" name="trajet" defaultValue={l.trajet} />
        </Champ>
        <Champ l={4} titre="Chargement">
          <input type="date" name="date_chargement" defaultValue={iso(l.date_chargement)} />
        </Champ>
        <Champ l={4} titre="Livraison">
          <input type="date" name="date_livraison" defaultValue={iso(l.date_livraison)} />
        </Champ>
        <Champ l={4} titre="Statut">
          <select name="statut" defaultValue={l.statut}>
            {Object.entries(LV_ST).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Champ>
        <Champ l={8} titre="Prestataire / agent">
          {/* L'annuaire des sous-traitants et partenaires (src/crm/partenaires) ; le texte libre reste accepté. */}
          <ChampPrestataire valeur={l.prestataire} />
        </Champ>
        <Champ l={4} titre="Prix sous-traitant (€)">
          <input type="number" step="1" name="prix_sous_traitance" defaultValue={l.prix_sous_traitance ?? ""} />
        </Champ>
        <Champ l={8} titre="Déménageurs (équipe)">
          <input type="text" name="equipe" defaultValue={l.equipe ?? ""} placeholder="Noms de l’équipe" />
        </Champ>
        <Champ l={4} titre="Immatriculation du camion">
          <input type="text" name="immatriculation" defaultValue={l.immatriculation ?? ""} placeholder="AB-123-CD" />
        </Champ>
        <Champ l={12} titre="Instructions aux déménageurs">
          <textarea name="instructions" defaultValue={l.instructions ?? ""} placeholder="Monte-meubles réservé à 8h, apporter un chèque…" />
        </Champ>
      </div>
      <div className={s.pied}>
        <p>{l.montant > 0 ? `Montant porté : ${eur(l.montant)}` : "Montant à 0 € (déjà compté sur la 1ʳᵉ lettre)"}</p>
        <Valider>Enregistrer la lettre</Valider>
      </div>
    </form>
  );
}

/** Planifier le déménagement : les dates fermes (au planning d'exploitation). */
export function FenetrePlanifier({ d }: { d: Row }) {
  return (
    <form action={A.planifierDemenagement.bind(null, d.id)}>
      <div className={s.grille}>
        <Champ titre="Date de chargement">
          <input type="date" name="date_chargement" defaultValue={iso(d.date_chargement)} required />
        </Champ>
        <Champ titre="Date de livraison">
          <input type="date" name="date_livraison" defaultValue={iso(d.date_livraison)} />
        </Champ>
      </div>
      <div className={s.pied}>
        {!d.date_chargement && <p>Sans date, le CA se rattache au mois prévu ({d.periode ?? "à préciser"}).</p>}
        <Valider>{d.date_chargement ? "Modifier les dates" : "Confirmer au planning"}</Valider>
      </div>
    </form>
  );
}

/** Dupliquer une visite : le même rendez-vous, à une autre date. */
export function FenetreCopieRdv({ d, r, jour, heure }: { d: Row; r: Row; jour: string; heure: string }) {
  return (
    <form action={F.copierRdv.bind(null, d.id, r.id)}>
      <div className={s.grille}>
        <Champ titre="Date">
          <input type="date" name="date" defaultValue={jour} required />
        </Champ>
        <Champ titre="Heure">
          <input type="time" name="heure" step={900} defaultValue={heure} required />
        </Champ>
        <p className={s.aide} style={{ gridColumn: "span 12" }}>
          Même type, même commercial, même durée ({r.duree_min} min), même lieu et même commentaire. Aucun SMS ne part : « Confirmer » l’envoie.
        </p>
        {!r.journee && (r.type === "phys" || r.type === "visio") && (
          <p className={s.aide} style={{ gridColumn: "span 12" }}>
            Changer de type (une visio puis une visite sur place) ou de commercial, en voyant sa semaine :{" "}
            <Link href={`/planning/nouveau?dossier=${d.id}&depuis=${r.id}`} style={{ color: "var(--accent)", fontWeight: 700 }}>
              ouvrir le planificateur
            </Link>
            .
          </p>
        )}
      </div>
      <div className={s.pied}>
        <Valider>Dupliquer la visite</Valider>
      </div>
    </form>
  );
}

/** Un litige : ouvrir, ou modifier son objet et son montant. */
export function FenetreLitige({ d, l }: { d: Row; l?: Row }) {
  return (
    <form action={l ? F.modifierLitige.bind(null, d.id, l.id) : B.ouvrirLitige.bind(null, d.id)}>
      <div className={s.grille}>
        <Champ l={8} titre="Objet du litige">
          <input type="text" name="objet" defaultValue={l?.objet ?? ""} placeholder="Meuble rayé, carton manquant…" required />
        </Champ>
        <Champ l={4} titre="Montant (€)">
          <input type="number" name="montant" defaultValue={l?.montant ?? ""} />
        </Champ>
      </div>
      <div className={s.pied}>
        <Valider>{l ? "Enregistrer" : "Ouvrir le litige"}</Valider>
      </div>
    </form>
  );
}

/** Un contact du client : ajouter ou modifier. */
export function FenetreContact({ d, c }: { d: Row; c?: Row }) {
  return (
    <form action={c ? F.modifierContact.bind(null, d.id, c.id) : F.ajouterContact.bind(null, d.id)}>
      <div className={s.grille}>
        <Champ l={2} titre="Civilité">
          <select name="civilite" defaultValue={c?.civilite ?? ""}>
            <option value="">—</option>
            <option>Madame</option>
            <option>Monsieur</option>
          </select>
        </Champ>
        <Champ l={4} titre="Prénom">
          <input type="text" name="prenom" defaultValue={c?.prenom ?? ""} />
        </Champ>
        <Champ l={6} titre="Nom">
          <input type="text" name="nom" defaultValue={c?.nom ?? ""} required />
        </Champ>
        <Champ l={12} titre="Fonction ou lien avec le client">
          <input type="text" name="fonction" defaultValue={c?.fonction ?? ""} />
        </Champ>
        <Champ titre="Téléphone">
          <input type="tel" name="telephone" defaultValue={c?.telephone ?? ""} />
        </Champ>
        <Champ titre="E-mail">
          <input type="email" name="email" defaultValue={c?.email ?? ""} />
        </Champ>
        <Champ l={12} titre="Notes">
          <textarea name="notes" defaultValue={c?.notes ?? ""} />
        </Champ>
      </div>
      <div className={s.pied}>
        <Valider>{c ? "Enregistrer le contact" : "Ajouter le contact"}</Valider>
      </div>
    </form>
  );
}

export const STATUTS_SERVICE: Record<string, { libelle: string; ton: string }> = {
  prevu: { libelle: "Prévu", ton: "i" },
  confirme: { libelle: "Confirmé", ton: "p" },
  realise: { libelle: "Réalisé", ton: "g" },
  annule: { libelle: "Annulé", ton: "r" },
};

/** Un service complémentaire (modèle provisoire) : ajouter ou modifier. */
export function FenetreService({ d, v }: { d: Row; v?: Row }) {
  return (
    <form action={v ? F.modifierService.bind(null, d.id, v.id) : F.ajouterService.bind(null, d.id)}>
      <div className={s.grille}>
        <Champ l={12} titre="Service">
          <input type="text" name="libelle" defaultValue={v?.libelle ?? ""} required />
        </Champ>
        <Champ l={4} titre="Date prévue">
          <input type="date" name="date_prevue" defaultValue={iso(v?.date_prevue)} />
        </Champ>
        <Champ l={4} titre="Montant (€)">
          <input type="number" step="1" name="montant" defaultValue={v?.montant ?? ""} />
        </Champ>
        <Champ l={4} titre="Statut">
          <select name="statut" defaultValue={v?.statut ?? "prevu"}>
            {Object.entries(STATUTS_SERVICE).map(([k, x]) => (
              <option key={k} value={k}>
                {x.libelle}
              </option>
            ))}
          </select>
        </Champ>
        <Champ l={12} titre="Notes">
          <textarea name="notes" defaultValue={v?.notes ?? ""} />
        </Champ>
      </div>
      <div className={s.pied}>
        <p>Section provisoire : un service, une date, un montant, un statut.</p>
        <Valider>{v ? "Enregistrer le service" : "Ajouter le service"}</Valider>
      </div>
    </form>
  );
}
