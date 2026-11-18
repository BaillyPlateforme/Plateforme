/*
 * La fiche Créagidem d'une demande du site : le format de l'API
 * « importfiche » de Créagiciel, repris du script PHP de Noiise
 * (formbailly.php, 2025), qui créait une fiche à chaque formulaire du site
 * WordPress. Module pur : aucune entrée-sortie, il se teste seul.
 *
 * Ce que dit le format (commentaires du script) :
 *   - fiche.emetteur : obligatoire, valeur fixée par Créagiciel ;
 *   - client.nom, chargement.ville, livraison.ville : obligatoires ;
 *   - code_postal : chiffres seulement (un code français) ; etage : entier positif ;
 *   - est_rdc, est_ascenseur, est_demande_stationnement : 0 ou 1 ;
 *   - detail_acces : 100 caractères ;
 *   - date_ou_periode : AAAAMMJJ, AAAAMM, ou un texte (« FIN SEPTEMBRE ») ;
 *   - distance, valeur : décimaux à deux chiffres ; type_assurance forcé à D.
 *
 * Écarts volontaires avec le script :
 *   - les décimaux partent sans séparateur de milliers (« 1250.00 ») : le
 *     number_format de PHP écrivait « 1,250.00 » au-delà de 999 ;
 *   - la distance vient de la plateforme (celle du formulaire, sinon le
 *     calcul routier du serveur), et non plus d'OpenRouteService ; sans
 *     distance (étranger, outre-mer, ville introuvable), « 0.00 », et le
 *     détail le dit ;
 *   - un code postal étranger (lettres, tiret : « SW1A 1AA ») part tel quel
 *     s'il tient en CP_MAX caractères — réduit à ses chiffres, il devenait un
 *     autre code (« 11 ») ; plus long, il part vide, et le code va en tête du
 *     détail d'accès ;
 *   - la valeur déclarée est une tranche (« 10 000 – 30 000 € ») : on envoie
 *     sa borne haute, et la tranche telle quelle dans le détail (à valider) ;
 *   - le détail de l'opération reprend ce que le client a dit (volume,
 *     formule, garantie, services, objets lourds, commentaire) et le lien de
 *     la demande dans le CRM.
 */
import type { RequestRow } from "@/lib/types";
import { TRANSPORT_SEUL, transportSeul } from "@/lib/pricing/grille";

export interface AdresseCreagidem {
  adresse1: string;
  adresse2: string;
  code_postal: string;
  ville: string;
  pays: string;
  est_rdc: 0 | 1;
  etage: number;
  est_ascenseur: 0 | 1;
  est_demande_stationnement: 0 | 1;
  detail_acces: string;
  date_ou_periode: string;
}

export interface FicheCreagidem {
  fiche: { emetteur: string; date_demande: string };
  client: { nom: string; prenom: string; email: string; tel_portable: string };
  chargement: AdresseCreagidem;
  livraison: AdresseCreagidem;
  operation: { distance: string; valeur: string; type_assurance: "D"; detail: string };
}

type Brut = Record<string, unknown>;
const obj = (v: unknown): Brut => (v && typeof v === "object" && !Array.isArray(v) ? (v as Brut) : {});
const txt = (v: unknown) => (typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "");
const oui = (v: unknown) => v === true || (typeof v === "string" && /^(oui|true|1)$/i.test(v.trim()));
const decimal = (n: number | null | undefined) => (typeof n === "number" && Number.isFinite(n) && n > 0 ? n : 0).toFixed(2);

/** AAAAMMJJ, dans le fuseau de Paris. */
export function jourCreagidem(d: Date = new Date()): string {
  return new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(d).replaceAll("-", "");
}

const MOIS = ["janvier", "fevrier", "mars", "avril", "mai", "juin", "juillet", "aout", "septembre", "octobre", "novembre", "decembre"];
const sansAccents = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");

/** La date ou la période : AAAAMMJJ d'une date, AAAAMM d'un « novembre 2026 », sinon le texte en capitales. */
export function dateOuPeriode(date: string | null | undefined, periode: string | null | undefined): string {
  const d = txt(date).slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d.replaceAll("-", "");
  const p = sansAccents(txt(periode).toLowerCase());
  if (!p) return "";
  const an = p.match(/\b(20\d{2})\b/)?.[1];
  const mois = MOIS.findIndex((m) => new RegExp(`\\b${m}\\b`).test(p));
  // « Novembre 2026 » : un mois entier. « Début novembre », « fin septembre » : le texte, que l'équipe lit.
  if (an && mois >= 0 && !/\b(debut|mi|fin|avant|apres|entre)\b/.test(p)) return `${an}${String(mois + 1).padStart(2, "0")}`;
  return txt(periode).toUpperCase().slice(0, 60);
}

/** La borne haute d'une tranche de valeur (« 10 000 – 30 000 € » → 30 000), ou le nombre saisi. */
export function valeurDeclaree(v: unknown): number | null {
  const nombres = (txt(v).match(/\d[\d\s  .]*/g) ?? [])
    .map((x) => Number(x.replace(/[\s  .]/g, "")))
    .filter((n) => Number.isFinite(n) && n > 0);
  return nombres.length ? Math.max(...nombres) : null;
}

/** La place d'un code postal étranger dans la fiche (les codes connus en tiennent dix : « SW1A 1AA », « 1100-148 »). */
export const CP_MAX = 10;

/**
 * Le code postal tel que Créagidem le reçoit. Un code français : ses chiffres
 * (« 75 002 » → « 75002 »). Un code étranger, jamais réduit à ses chiffres
 * (« SW1A 1AA » devenait « 11 », un autre code) : tel quel s'il tient dans le
 * champ ; sinon vide, et `aParte` le garde pour le détail.
 */
export function codePostalCreagidem(brut: unknown): { code: string; aParte: string } {
  const t = txt(brut).replace(/\s+/g, " ");
  if (!t) return { code: "", aParte: "" };
  if (/^[\d ]+$/.test(t)) return { code: t.replace(/\D/g, ""), aParte: "" };
  return t.length <= CP_MAX && /^[\p{L}\p{N} -]+$/u.test(t) ? { code: t, aParte: "" } : { code: "", aParte: t };
}

/** Prénom et nom : ceux du formulaire quand il les sépare, sinon le nom saisi en entier (jamais coupé au hasard). */
function identite(r: RequestRow): { nom: string; prenom: string } {
  const contact = obj(obj(r.raw_payload.details).contact);
  const nom = txt(contact.nom);
  if (nom) return { nom, prenom: txt(contact.prenom) };
  return { nom: txt(r.client_nom) || txt(r.client_email), prenom: "" };
}

function adresse(r: RequestRow, cote: "depart" | "arrivee", periode: string): AdresseCreagidem {
  const saisie = obj(r.raw_payload[cote]);
  const detail = obj(obj(r.raw_payload.details)[cote]);
  const etage = cote === "depart" ? r.depart_etage : r.arrivee_etage;
  const ascenseur = cote === "depart" ? r.depart_ascenseur : r.arrivee_ascenseur;
  const logement = cote === "depart" ? r.type_logement_depart : r.type_logement_arrivee;
  const { code: cp, aParte } = codePostalCreagidem(cote === "depart" ? r.depart_code_postal : r.arrivee_code_postal);
  const portage = typeof saisie.portage_m === "number" && saisie.portage_m > 0 ? `Portage ${saisie.portage_m} m.` : "";
  const acces = [
    // Un code postal trop long pour le champ : en tête, pour ne pas être coupé.
    aParte ? `Code postal : ${aParte}.` : "",
    saisie.acces_difficile === undefined ? "" : `Accès difficile poids lourds : ${oui(saisie.acces_difficile) ? "oui" : "non"}.`,
    txt(detail.type_difficulte) ? `${txt(detail.type_difficulte)}.` : "",
    portage,
    logement ? `${txt(logement).charAt(0).toUpperCase()}${txt(logement).slice(1)}.` : "",
    typeof saisie.surface === "number" && saisie.surface > 0 ? `${saisie.surface} m².` : "",
  ].filter(Boolean).join(" ");
  const pays = txt(detail.pays) || (/^\d{5}$/.test(cp) ? "France" : "");
  return {
    adresse1: txt(cote === "depart" ? r.depart_adresse : r.arrivee_adresse),
    adresse2: txt(detail.complement),
    code_postal: cp,
    ville: txt(cote === "depart" ? r.depart_ville : r.arrivee_ville),
    pays,
    est_rdc: etage === 0 ? 1 : 0,
    etage: typeof etage === "number" && etage > 0 ? Math.round(etage) : 0,
    est_ascenseur: ascenseur ? 1 : 0,
    est_demande_stationnement: oui(saisie.stationnement) ? 1 : 0,
    detail_acces: acces.slice(0, 100),
    date_ou_periode: periode,
  };
}

const SERVICES: Record<string, string> = { emballage: "emballage", demontage: "démontage", montage: "remontage", monte_meuble: "monte-meuble", garde_meuble: "garde-meuble" };
const FORMULES: Record<string, string> = { eco: "Économique", standard: "Standard", luxe: "Luxe" };

/** Le détail de l'opération : ce que le client a dit, en clair, et le lien de la demande dans le CRM. */
function detailOperation(r: RequestRow, lienCrm: string | null, distanceConnue: boolean): string {
  const p = r.raw_payload;
  const details = obj(p.details);
  const services = Object.entries(r.services ?? {}).filter(([, v]) => v).map(([k]) => SERVICES[k] ?? k);
  const lourds = Array.isArray(p.charges_lourdes)
    ? (p.charges_lourdes as unknown[]).map((x) => [txt(obj(x).label), txt(obj(x).poids)].filter(Boolean).join(" ")).filter(Boolean)
    : [];
  const parcours = txt(details.parcours);
  const porte = details.express
    ? "particulier, devis express"
    : parcours === "entreprise"
      ? `entreprise, ${details.transfert === "projet" ? "projet important" : "petit transfert"}`
      : parcours === "mutation"
        ? "mutation professionnelle"
        : txt(p.type_client) === "entreprise"
          ? "entreprise"
          : "particulier, devis complet";
  const nombre = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null);
  const lignes = [
    `Demande du site Bailly (${porte})${lienCrm ? ` : ${lienCrm}` : ""}`,
    // Pour un muté, la société est son employeur ; pour une entreprise, le client lui-même.
    txt(p.societe) && `${parcours === "mutation" || oui(p.mutation_pro) ? "Employeur" : "Société"} : ${txt(p.societe)}${txt(details.fonction) ? ` (contact : ${txt(details.fonction)})` : ""}`,
    nombre(details.postes) && `Postes de travail : ${details.postes}`,
    nombre(details.surface_locaux) && `Surface des locaux : ${details.surface_locaux} m²`,
    txt(details.creneau || details.rendez_vous) && `Rendez-vous souhaité : ${txt(details.creneau || details.rendez_vous)}`,
    r.volume_m3 != null && `Volume : ${Number(r.volume_m3).toLocaleString("fr-FR")} m³${r.volume_method === "ai" ? " (estimé sur photos)" : r.volume_method === "list" ? " (liste de meubles)" : ""}`,
    // Le transport seul se chiffre sur la grille Économique, mais ce n'est pas l'Économique (lib/pricing/grille).
    r.formule && `Formule : ${transportSeul(p) ? TRANSPORT_SEUL : Object.hasOwn(FORMULES, r.formule) ? FORMULES[r.formule] : r.formule}`,
    // « 0.00 » dans la fiche : une distance inconnue, pas nulle.
    !distanceConnue && "Distance : non calculée (adresse à l'étranger, outre-mer ou ville introuvable) — à établir",
    txt(p.assurance) && `Garantie : ${txt(p.assurance)}`,
    txt(p.valeur_mobilier) && `Valeur du mobilier déclarée : ${txt(p.valeur_mobilier)}`,
    services.length > 0 && `Services : ${services.join(", ")}`,
    txt(details.demenagement) && `Déménagement : ${txt(details.demenagement)}`,
    oui(p.piano) && "Piano",
    oui(p.articles_lourds) && `Objets lourds${txt(p.articles_lourds_detail) ? ` : ${txt(p.articles_lourds_detail)}` : ""}`,
    lourds.length > 0 && `Charges lourdes : ${lourds.join(", ")}`,
    r.flexibilite && `Période : ${r.flexibilite}`,
    txt(p.commentaire) && `Commentaire du client : ${txt(p.commentaire)}`,
  ];
  return lignes.filter(Boolean).join("\n").slice(0, 2000);
}

/** Ce qui empêche la fiche d'être acceptée par Créagidem (champs obligatoires). */
export function manquesFiche(f: FicheCreagidem): string[] {
  return [
    !f.client.nom && "nom du client",
    !f.chargement.ville && "ville de chargement",
    !f.livraison.ville && "ville de livraison",
  ].filter((x): x is string => !!x);
}

export function ficheDepuisDemande(
  r: RequestRow,
  o: { emetteur: string; distanceKm: number | null; lienCrm: string | null; aujourdhui?: Date },
): FicheCreagidem {
  const periode = dateOuPeriode(r.date_souhaitee, r.flexibilite);
  const { nom, prenom } = identite(r);
  return {
    fiche: { emetteur: o.emetteur, date_demande: jourCreagidem(o.aujourdhui) },
    client: { nom, prenom, email: txt(r.client_email), tel_portable: txt(r.client_tel) },
    // Une seule date dans le formulaire : elle vaut pour le chargement et la livraison, comme dans le script.
    chargement: adresse(r, "depart", periode),
    livraison: adresse(r, "arrivee", periode),
    operation: {
      distance: decimal(o.distanceKm),
      valeur: decimal(valeurDeclaree(r.raw_payload.valeur_mobilier)),
      type_assurance: "D",
      detail: detailOperation(r, o.lienCrm, typeof o.distanceKm === "number" && Number.isFinite(o.distanceKm) && o.distanceKm >= 0),
    },
  };
}
