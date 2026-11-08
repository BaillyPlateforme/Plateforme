import type { Row } from "@/crm/lib/db";
import * as A from "@/crm/actions";
import * as B from "@/crm/actions2";
import { emballages } from "@/crm/lib/tarif";
import { dateFr, eur, m3, TYPES } from "@/crm/lib/format";
import { commencerVisite } from "@/crm/visites/actions";
import ChampPrestataire from "@/crm/partenaires/ChampPrestataire";
import ChampAdresse from "@/ui/ChampAdresse";
import { ACCES_ESCALIER, ACCES_MONTE_MEUBLE, ACCES_POIDS_LOURD, ACCES_STATIONNEMENT, GENRE_ETAPE } from "@/lib/visite/regles";
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
const DESTINATIONS = ["Arrivée", "Garde-meuble", "Don", "Déchetterie", "Autre adresse"];
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

/** « Fiche » : l'identité du client, reprise du formulaire de l'ancienne fiche (deux téléphones). */
export function FenetreIdentite({ d, espaceOuvert }: { d: Row; espaceOuvert: boolean }) {
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
        <Champ l={6} titre="Téléphone" aide="reçoit les SMS du dossier">
          <input type="tel" name="client_telephone" defaultValue={d.telephone ?? ""} />
        </Champ>
        <Champ l={6} titre="Autre téléphone">
          <input type="tel" name="client_telephone2" defaultValue={d.telephone2 ?? ""} />
        </Champ>
        <Champ l={12} titre="E-mail" aide={espaceOuvert ? "identifiant de l'espace client : il se modifie depuis la fiche de l'espace" : undefined}>
          <input type="email" name="client_email" defaultValue={d.email ?? ""} readOnly={espaceOuvert} />
        </Champ>
      </div>
      <div className={s.pied}>
        <p>
          Client n° {d.client_id} · dossier {d.ref}
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
  return (
    <form action={F.majItineraire.bind(null, d.id)}>
      {d.stops.map((e: Row, i: number) => (
        <fieldset key={e.id} className={s.etape}>
          <legend>
            <i>{i + 1}</i>
            {GENRE_ETAPE[e.genre] ?? "Étape"}
            {["autre", "garde_meuble"].includes(e.genre) && (
              <button name="retirer" value={e.id} data-garder="" title="Retirer cette étape">
                Retirer
              </button>
            )}
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
          <input type="month" name="mois_ca" defaultValue={moisCa} />
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
        <p>Les adresses servent aussi au devis, aux lettres de voiture et à l’espace du client.</p>
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
        <b style={{ marginLeft: "auto", fontSize: 15 }}>{m3(d.volume)}</b>
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
                    {i.libelle}
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
        <input type="number" name="volume" step="0.1" placeholder="m³" required title="Volume unitaire" aria-label="Volume unitaire" />
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
        <p>Le volume du dossier suit l’inventaire.</p>
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

/** Copier une visite : le même rendez-vous, à une autre date. */
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
      </div>
      <div className={s.pied}>
        <Valider>Copier la visite</Valider>
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
