import "server-only";
import { q, q1, type Row } from "@/crm/lib/db";
import { getSettings } from "@/lib/settings";
import { nomClient } from "@/crm/lib/format";
import { TVA_DEFAUT_CODE, htDepuisTtc, jourIso, arrondi, aujourdhuiParis, type LigneSaisie } from "./calcul";

/*
 * Les lectures de l'encaissement et de la facturation. Tous les montants
 * dus, encaissés et restant à payer viennent des vues crm.factures_soldes et
 * crm.dossiers_soldes (voir schema.ts) : un seul calcul pour tout le CRM.
 */

const n = (v: unknown) => (v == null ? 0 : Number(v));

/* ---------- réglages et mentions ---------- */

export interface Reglages {
  raison_sociale: string | null; forme_juridique: string | null; capital: string | null; rcs: string | null;
  siren: string | null; tva_intracom: string | null; code_ape: string | null;
  adresse: string | null; code_postal: string | null; ville: string | null; pays: string | null;
  iban: string | null; bic: string | null; banque: string | null;
  conditions_reglement: string | null; delai_paiement_jours: number | null; penalites_retard: string | null;
  indemnite_recouvrement: string | null; escompte: string | null; taux_tva_defaut: number | null;
  comptes_encaissement: string | null; mention_pied: string | null;
}
export const CHAMPS_REGLAGES: (keyof Reglages)[] = [
  "raison_sociale", "forme_juridique", "capital", "rcs", "siren", "tva_intracom", "code_ape", "adresse", "code_postal", "ville", "pays",
  "iban", "bic", "banque", "conditions_reglement", "delai_paiement_jours", "penalites_retard", "indemnite_recouvrement", "escompte",
  "taux_tva_defaut", "comptes_encaissement", "mention_pied",
];
const VIDES = Object.fromEntries(CHAMPS_REGLAGES.map((k) => [k, null])) as unknown as Reglages;

export async function reglagesFacturation(): Promise<Reglages> {
  const r = await q1<Reglages>(`select ${CHAMPS_REGLAGES.join(",")} from facturation_reglages where id`).catch(() => undefined);
  if (!r) return { ...VIDES };
  return { ...r, delai_paiement_jours: r.delai_paiement_jours == null ? null : Number(r.delai_paiement_jours), taux_tva_defaut: r.taux_tva_defaut == null ? null : Number(r.taux_tva_defaut) };
}

/** Le taux proposé sur une nouvelle ligne : celui des Paramètres, sinon celui du devis (voir calcul.ts). */
export const tauxParDefaut = (r: Reglages) => r.taux_tva_defaut ?? TVA_DEFAUT_CODE;
export const comptesEncaissement = (r: Reglages) => (r.comptes_encaissement ?? "").split(/\n+/).map((x) => x.trim()).filter(Boolean);

/**
 * Les mentions de l'émetteur, telles que la facture les imprime : celles de
 * la facturation (Paramètres › Facturation), complétées par l'adresse et le
 * SIRET de la carte « Entreprise » des Paramètres quand ils y sont. Rien
 * n'est inventé : une mention absente n'est pas imprimée, elle est signalée.
 */
export interface Mentions {
  nom: string; formeJuridique: string | null; capital: string | null; rcs: string | null; siren: string | null; siret: string | null;
  tvaIntracom: string | null; codeApe: string | null;
  adresse: string | null; codePostal: string | null; ville: string | null; pays: string | null; adresseLibre: string | null;
  iban: string | null; bic: string | null; banque: string | null;
  penalites: string | null; indemnite: string | null; escompte: string | null; pied: string | null; conditions: string | null;
}

export async function mentionsEmetteur(r?: Reglages): Promise<Mentions> {
  const [g, s] = await Promise.all([r ? Promise.resolve(r) : reglagesFacturation(), getSettings().catch(() => null)]);
  const t = (v: string | null | undefined) => v?.trim() || null;
  return {
    nom: t(g.raison_sociale) ?? t(s?.entreprise_nom) ?? "Bailly Déménagement",
    formeJuridique: t(g.forme_juridique), capital: t(g.capital), rcs: t(g.rcs), siren: t(g.siren), siret: t(s?.siret),
    tvaIntracom: t(g.tva_intracom), codeApe: t(g.code_ape),
    adresse: t(g.adresse), codePostal: t(g.code_postal), ville: t(g.ville), pays: t(g.pays), adresseLibre: t(s?.entreprise_adresse),
    iban: t(g.iban), bic: t(g.bic), banque: t(g.banque),
    penalites: t(g.penalites_retard), indemnite: t(g.indemnite_recouvrement), escompte: t(g.escompte), pied: t(g.mention_pied),
    conditions: t(g.conditions_reglement),
  };
}

/** Les mentions d'une facture : celles figées à son émission, complétées par les réglages actuels pour ce qui manquait alors. */
export function mentionsDeLaFacture(actuelles: Mentions, figees: Partial<Mentions> | null | undefined): Mentions {
  if (!figees) return actuelles;
  const m = { ...actuelles } as Record<string, unknown>;
  for (const [k, v] of Object.entries(figees)) if (v != null && v !== "") m[k] = v;
  return m as unknown as Mentions;
}

/* ---------- soldes ---------- */

export interface Solde {
  engage: number; facture: number; factureDemenagement: number; factureGardeMeuble: number; soldeFacture: boolean;
  encaisse: number; regle: number; nonAffecte: number; du: number; reste: number; aFacturer: number; resteFactures: number;
}
const VERS_SOLDE = (r: Row | undefined): Solde => ({
  engage: n(r?.engage), factureDemenagement: n(r?.facture_demenagement), factureGardeMeuble: n(r?.facture_garde_meuble),
  facture: arrondi(n(r?.facture_demenagement) + n(r?.facture_garde_meuble)), soldeFacture: !!r?.solde_facture,
  encaisse: n(r?.encaisse), regle: n(r?.regle), nonAffecte: n(r?.non_affecte), du: n(r?.du), reste: n(r?.reste),
  aFacturer: n(r?.a_facturer), resteFactures: n(r?.reste_factures),
});

/** Ce que doit le client sur ce dossier (négatif : un crédit), et d'où vient ce chiffre. */
export async function soldeDossier(dossierId: number): Promise<Solde> {
  return VERS_SOLDE(await q1("select * from dossiers_soldes where dossier_id=$1", [dossierId]));
}
export async function soldesDossiers(ids: number[]): Promise<Map<number, Solde>> {
  if (!ids.length) return new Map();
  const rows = await q("select * from dossiers_soldes where dossier_id = any($1)", [ids]);
  return new Map(rows.map((r) => [Number(r.dossier_id), VERS_SOLDE(r)]));
}
/** Le total restant à encaisser sur les dossiers en cours (signés, planifiés, terminés), et les plus gros. */
export async function aEncaisser(limite = 5) {
  const rows = await q(`select s.dossier_id, s.reste::float8 as reste, s.du::float8 as du, d.ref, c.nom, c.prenom, c.societe, d.date_chargement
      from dossiers_soldes s join dossiers d on d.id = s.dossier_id join clients c on c.id = d.client_id
     where s.reste > 0 and d.statut in ('commande','planifie','termine') order by s.reste desc`);
  return { total: arrondi(rows.reduce((a, r) => a + r.reste, 0)), nombre: rows.length, premiers: rows.slice(0, limite) };
}

/* ---------- le payeur ---------- */

export interface Payeur {
  clientId: number | null; type: string | null; nom: string; contact: string | null; email: string | null; telephone: string | null;
  adresse: string | null; codePostal: string | null; ville: string | null; pays: string | null; siren: string | null; tvaIntracom: string | null;
}
export function payeurDe(c: Row | undefined | null): Payeur | null {
  if (!c) return null;
  const contact = [c.civilite, c.prenom, c.nom].filter(Boolean).join(" ");
  return {
    clientId: c.id ?? null, type: c.type ?? null, nom: nomClient(c) || c.nom || "Sans nom", contact: c.societe ? contact || null : null,
    email: c.email ?? null, telephone: c.telephone ?? null,
    adresse: c.facturation_adresse ?? null, codePostal: c.facturation_cp ?? null, ville: c.facturation_ville ?? null, pays: c.facturation_pays ?? null,
    siren: c.siren ?? null, tvaIntracom: c.tva_intracom ?? null,
  };
}
const COLS_CLIENT = "id,type,civilite,prenom,nom,societe,email,telephone,facturation_adresse,facturation_cp,facturation_ville,facturation_pays,siren,tva_intracom";

/* ---------- le dossier ---------- */

export interface FactureVue {
  id: number; numero: string; genre: string; objet: string; ttc: number; ht: number | null; tva: number | null; statut: string; etat: string;
  reste: number; affecte: number; enRetard: boolean; emiseLe: string | null; echeanceLe: string | null; payeeLe: string | null; annuleeLe: string | null;
  dateMode: string | null; payeurNom: string | null; origineNumero: string | null; avoirNumero: string | null; avoirId: number | null;
  nbLignes: number; deduiteSur: string | null; motif: string | null; gardeMeuble: boolean;
}
export interface ReglementVue {
  id: number; dossierId: number; libelle: string; montant: number; recuLe: string | null; mode: string | null; nature: string | null;
  banque: string | null; numeroCheque: string | null; titulaire: string | null; compte: string | null; datePrevue: string | null;
  commentaire: string | null; factureId: number | null; factureNumero: string | null; factureEtat: string | null; enLigne: boolean; saisiPar: string | null;
}

const SQL_FACTURES = `select f.id, f.numero, f.genre, f.objet, f.montant::float8 as ttc, f.montant_ht::float8 as ht, f.montant_tva::float8 as tva, f.statut,
    s.etat, s.reste::float8 as reste, s.affecte::float8 as affecte, s.en_retard, s.garde_meuble, f.emise_le, f.echeance_le, f.payee_le, f.annulee_le, f.date_mode,
    f.payeur->>'nom' as payeur_nom, f.motif, o.numero as origine_numero,
    (select a.numero from factures a where a.facture_origine_id = f.id and a.genre = 'avoir' order by a.id limit 1) as avoir_numero,
    (select a.id from factures a where a.facture_origine_id = f.id and a.genre = 'avoir' order by a.id limit 1) as avoir_id,
    (select count(*) from factures_lignes l where l.facture_id = f.id)::int as nb_lignes,
    (select x.numero from factures_lignes l join factures x on x.id = l.facture_id
      where l.facture_deduite_id = f.id and x.statut <> 'annulee' and x.genre <> 'avoir' order by x.id limit 1) as deduite_sur
  from factures f join factures_soldes s on s.id = f.id left join factures o on o.id = f.facture_origine_id`;

const versFacture = (r: Row): FactureVue => ({
  id: r.id, numero: r.numero, genre: r.genre, objet: r.objet, ttc: r.ttc, ht: r.ht, tva: r.tva, statut: r.statut,
  etat: r.en_retard && r.etat !== "partielle" ? "retard" : r.etat, reste: r.reste, affecte: r.affecte, enRetard: !!r.en_retard,
  emiseLe: jourIso(r.emise_le), echeanceLe: jourIso(r.echeance_le), payeeLe: jourIso(r.payee_le), annuleeLe: jourIso(r.annulee_le),
  dateMode: r.date_mode, payeurNom: r.payeur_nom, origineNumero: r.origine_numero, avoirNumero: r.avoir_numero, avoirId: r.avoir_id,
  nbLignes: r.nb_lignes, deduiteSur: r.deduite_sur, motif: r.motif, gardeMeuble: !!r.garde_meuble,
});

const SQL_REGLEMENTS = `select p.id, p.dossier_id, p.libelle, p.montant::float8 as montant, p.recu_le, p.mode, p.nature, p.banque, p.numero_cheque, p.titulaire,
    p.compte_encaissement, p.date_prevue, p.commentaire, p.facture_id, f.numero as facture_numero, s.etat as facture_etat,
    p.session_paiement_id is not null as en_ligne, u.initiales as saisi_par
  from paiements p left join factures f on f.id = p.facture_id left join factures_soldes s on s.id = p.facture_id left join utilisateurs u on u.id = p.saisi_par`;

const versReglement = (r: Row): ReglementVue => ({
  id: r.id, dossierId: r.dossier_id, libelle: r.libelle, montant: r.montant, recuLe: jourIso(r.recu_le), mode: r.mode, nature: r.nature,
  banque: r.banque, numeroCheque: r.numero_cheque, titulaire: r.titulaire, compte: r.compte_encaissement, datePrevue: jourIso(r.date_prevue),
  commentaire: r.commentaire, factureId: r.facture_id, factureNumero: r.facture_numero, factureEtat: r.facture_etat, enLigne: !!r.en_ligne, saisiPar: r.saisi_par,
});

/** Une ligne de facture proposée, avant émission. `sansMontant` : une ligne à 0 € du devis, incluse ou non. */
export type LigneProposee = LigneSaisie & { sansMontant?: boolean };

export interface Brouillon {
  genre: "solde" | "acompte" | "facture";
  objet: string;
  lignes: LigneProposee[];
  /** Les règlements proposés à l'affectation (cochés d'office). */
  affecter: number[];
  devisId: number | null;
}

export interface DonneesFacturation {
  dossierId: number; ref: string; statut: string; segment: string; aujourdhui: string;
  chargement: string | null; livraison: string | null;
  client: Payeur; payeur: Payeur | null; bonCommande: string | null;
  adresses: { depart: string | null; arrivee: string | null };
  devis: { id: number; numero: string; formule: string; montant: number } | null;
  solde: Solde; factures: FactureVue[]; reglements: ReglementVue[];
  brouillons: Record<"solde" | "acompte" | "facture", Brouillon>;
  taux: number; comptes: string[]; delai: number | null; conditions: string | null;
  derniereDate: string | null;
}

const FORMULE: Record<string, string> = { economique: "Économique", standard: "Standard", premium: "Premium" };
const ville = (a: string | null | undefined) => {
  if (!a) return null;
  const m = a.split(",").map((x) => x.trim()).filter(Boolean);
  return (m[m.length - 1] ?? a).replace(/^\d{4,5}\s+/, "");
};

/** Tout ce que la carte « Facturation » d'un dossier affiche, et les brouillons de ses trois factures. */
export async function facturationDossier(id: number): Promise<DonneesFacturation | null> {
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  const d = await q1(`select d.id, d.ref, d.statut, d.date_chargement, d.date_livraison, d.payeur_client_id, d.bon_commande, d.client_id,
      (select adresse from etapes_trajet where dossier_id=d.id and genre='depart' order by ordre limit 1) as depart,
      (select adresse from etapes_trajet where dossier_id=d.id and genre='arrivee' order by ordre desc limit 1) as arrivee
      from dossiers d where d.id=$1`, [id]);
  if (!d) return null;
  const [client, payeur, devis, factures, reglements, solde, reglages, derniere, acomptesLignes] = await Promise.all([
    q1(`select ${COLS_CLIENT} from clients where id=$1`, [d.client_id]),
    d.payeur_client_id ? q1(`select ${COLS_CLIENT} from clients where id=$1`, [d.payeur_client_id]) : Promise.resolve(undefined),
    q1("select id, numero, formule, montant::float8 as montant, lignes, prestations from devis where dossier_id=$1 and statut='signe' order by signe_le desc nulls last, id desc limit 1", [id]),
    q(`${SQL_FACTURES} where f.dossier_id=$1 order by f.emise_le, f.id`, [id]),
    q(`${SQL_REGLEMENTS} where p.dossier_id=$1 order by p.recu_le, p.id`, [id]),
    soldeDossier(id),
    reglagesFacturation(),
    q1<{ le: Date | null }>("select max(emise_le) as le from factures where numero like 'FA-%'"),
    q(`select l.facture_id, l.taux_tva::float8 as taux, sum(l.montant_ht)::float8 as ht from factures_lignes l join factures f on f.id = l.facture_id
        where f.dossier_id=$1 and f.genre='acompte' and f.statut <> 'annulee' and l.genre <> 'texte' group by 1, 2`, [id]),
  ]);
  const taux = tauxParDefaut(reglages);
  const fs = factures.map(versFacture);
  const rs = reglements.map(versReglement);
  const trajet = [ville(d.depart), ville(d.arrivee)].filter(Boolean).join(" → ");

  // La facture de solde : les lignes du devis signé (prix TTC, ramenés au HT au taux par défaut), les lignes
  // à 0 € (à charge du client) et les prestations comprises en lignes « sans montant », puis les factures
  // d'arrhes déduites (au HT, à leur taux), et les règlements pas encore affectés.
  const lignesSolde: LigneProposee[] = [];
  if (devis) {
    for (const l of (devis.lignes as Row[]) ?? []) {
      const prix = Number(l.prix ?? 0);
      const client = l.charge === "client" || prix === 0;
      lignesSolde.push({ genre: "prestation", libelle: String(l.libelle ?? "Prestation"), detail: client ? "À la charge du client" : null, quantite: 1, prixUnitaireHt: client ? 0 : htDepuisTtc(prix, taux), tauxTva: taux, sansMontant: client });
    }
    for (const p of ((devis.prestations as Row[]) ?? []).filter((x) => x.charge === "bailly")) {
      lignesSolde.push({ genre: "texte", libelle: String(p.libelle), detail: "Prestation comprise", quantite: 0, prixUnitaireHt: 0, tauxTva: taux, sansMontant: true });
    }
  } else {
    lignesSolde.push({ genre: "prestation", libelle: `Déménagement${trajet ? ` ${trajet}` : ""}`, quantite: 1, prixUnitaireHt: 0, tauxTva: taux });
  }
  const deduites = new Set(fs.filter((f) => f.deduiteSur).map((f) => f.id));
  for (const a of fs.filter((f) => f.genre === "acompte" && f.statut !== "annulee" && !deduites.has(f.id))) {
    const parts = acomptesLignes.filter((l) => l.facture_id === a.id);
    const groupes = parts.length ? parts : [{ taux, ht: htDepuisTtc(a.ttc, taux) }];
    for (const g of groupes) {
      lignesSolde.push({ genre: "deduction", libelle: `Arrhes déjà facturées · facture ${a.numero}`, detail: a.emiseLe ? `Facture d'arrhes du ${a.emiseLe.split("-").reverse().join("/")}` : null, quantite: 1, prixUnitaireHt: -Number(g.ht), tauxTva: Number(g.taux), factureDeduiteId: a.id });
    }
  }
  const libres = rs.filter((r) => r.factureId == null && r.montant > 0);
  const arrhesLibres = libres.filter((r) => r.nature === "arrhes");
  const montantArrhes = arrhesLibres.reduce((a, r) => a + r.montant, 0) || (devis ? Math.round(devis.montant * 0.3) : 0);

  const brouillons: DonneesFacturation["brouillons"] = {
    solde: { genre: "solde", objet: `Déménagement${trajet ? ` ${trajet}` : ""}`, lignes: lignesSolde, affecter: libres.map((r) => r.id), devisId: devis?.id ?? null },
    acompte: {
      genre: "acompte", objet: devis ? `Arrhes sur le devis ${devis.numero}` : "Arrhes du déménagement",
      lignes: [{ genre: "prestation", libelle: devis ? `Arrhes · devis ${devis.numero} (formule ${FORMULE[devis.formule] ?? devis.formule})` : "Arrhes du déménagement", detail: trajet || null, quantite: 1, prixUnitaireHt: htDepuisTtc(montantArrhes, taux), tauxTva: taux }],
      affecter: arrhesLibres.map((r) => r.id), devisId: devis?.id ?? null,
    },
    facture: { genre: "facture", objet: "Prestation complémentaire", lignes: [{ genre: "prestation", libelle: "", quantite: 1, prixUnitaireHt: 0, tauxTva: taux }], affecter: [], devisId: devis?.id ?? null },
  };

  return {
    dossierId: id, ref: d.ref, statut: d.statut, segment: client?.type ?? "particulier", aujourdhui: aujourdhuiParis(),
    chargement: jourIso(d.date_chargement), livraison: jourIso(d.date_livraison),
    client: payeurDe(client)!, payeur: payeurDe(payeur), bonCommande: d.bon_commande ?? null,
    adresses: { depart: d.depart ?? null, arrivee: d.arrivee ?? null },
    devis: devis ? { id: devis.id, numero: devis.numero, formule: devis.formule, montant: devis.montant } : null,
    solde, factures: fs, reglements: rs, brouillons,
    taux, comptes: comptesEncaissement(reglages), delai: reglages.delai_paiement_jours, conditions: reglages.conditions_reglement?.trim() || null,
    derniereDate: jourIso(derniere?.le),
  };
}

/* ---------- une facture complète (impression, facture électronique) ---------- */

export interface FactureComplete extends FactureVue {
  dossierId: number | null; devisId: number | null; conditions: string | null; bonCommande: string | null;
  payeur: Payeur | null; origine: Payeur | null; mentions: Partial<Mentions> | null; factureOrigineId: number | null;
  lignes: { genre: string; libelle: string; detail: string | null; quantite: number; unite: string | null; prixUnitaireHt: number; tauxTva: number; ht: number; tva: number; ttc: number; factureDeduiteId: number | null }[];
  reglements: ReglementVue[]; devisNumero: string | null; emisePar: string | null;
}

export async function factureComplete(id: number): Promise<FactureComplete | null> {
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  const r = await q1(`${SQL_FACTURES.replace("select f.id,", "select f.dossier_id, f.devis_id, f.conditions_reglement, f.bon_commande, f.payeur, f.mentions, f.facture_origine_id, f.origine_client_id, f.garde_meuble_id, u.nom as emise_par_nom, v.numero as devis_numero, f.id,")}
      left join utilisateurs u on u.id = f.emise_par left join devis v on v.id = f.devis_id where f.id=$1`, [id]);
  if (!r) return null;
  const [lignes, reglements, origine] = await Promise.all([
    q(`select genre, libelle, detail, quantite::float8 as quantite, unite, prix_unitaire_ht::float8 as pu, taux_tva::float8 as taux, montant_ht::float8 as ht,
        montant_tva::float8 as tva, montant_ttc::float8 as ttc, facture_deduite_id from factures_lignes where facture_id=$1 order by ordre, id`, [id]),
    q(`${SQL_REGLEMENTS} where p.facture_id=$1 order by p.recu_le, p.id`, [id]),
    r.origine_client_id
      ? q1(`select ${COLS_CLIENT} from clients where id=$1`, [r.origine_client_id])
      : r.dossier_id ? q1(`select c.${COLS_CLIENT.split(",").join(",c.")} from clients c join dossiers d on d.client_id=c.id where d.id=$1`, [r.dossier_id]) : Promise.resolve(undefined),
  ]);
  const p = r.payeur as Row | null;
  return {
    ...versFacture(r),
    dossierId: r.dossier_id, devisId: r.devis_id, conditions: r.conditions_reglement, bonCommande: r.bon_commande,
    payeur: p ? { clientId: p.clientId ?? null, type: p.type ?? null, nom: p.nom, contact: p.contact ?? null, email: p.email ?? null, telephone: p.telephone ?? null, adresse: p.adresse ?? null, codePostal: p.codePostal ?? null, ville: p.ville ?? null, pays: p.pays ?? null, siren: p.siren ?? null, tvaIntracom: p.tvaIntracom ?? null } : null,
    origine: payeurDe(origine), mentions: (r.mentions as Partial<Mentions> | null) ?? null, factureOrigineId: r.facture_origine_id,
    lignes: lignes.map((l) => ({ genre: l.genre, libelle: l.libelle, detail: l.detail, quantite: l.quantite, unite: l.unite, prixUnitaireHt: l.pu, tauxTva: l.taux, ht: l.ht, tva: l.tva, ttc: l.ttc, factureDeduiteId: l.facture_deduite_id })),
    reglements: reglements.map(versReglement), devisNumero: r.devis_numero, emisePar: r.emise_par_nom,
  };
}

/* ---------- les listes de la page Factures ---------- */

export interface FiltresFactures { genres?: string[]; etat?: string | null; dossier?: number | null; q?: string | null; client?: number | null }

export interface LigneListeFacture extends FactureVue {
  dossierId: number | null; ref: string | null; origineNom: string; origineId: number | null; payeurId: number | null; payeurNomAffiche: string;
}

export async function listeFactures(f: FiltresFactures = {}): Promise<LigneListeFacture[]> {
  const w: string[] = [], p: unknown[] = [];
  if (f.genres?.length) { p.push(f.genres); w.push(`f.genre = any($${p.length})`); }
  if (f.dossier) { p.push(f.dossier); w.push(`f.dossier_id = $${p.length}`); }
  if (f.client) { p.push(f.client); w.push(`(coalesce(f.origine_client_id, d.client_id) = $${p.length} or coalesce(f.payeur_client_id, (f.payeur->>'clientId')::int) = $${p.length})`); }
  if (f.q) {
    p.push(`%${f.q}%`);
    w.push(`(f.numero ilike $${p.length} or f.objet ilike $${p.length} or d.ref ilike $${p.length} or c.nom ilike $${p.length} or c.prenom ilike $${p.length} or c.societe ilike $${p.length} or f.payeur->>'nom' ilike $${p.length} or gm.client ilike $${p.length})`);
  }
  if (f.etat === "ouvertes") w.push(`s.reste > 0`);
  else if (f.etat === "retard") w.push(`s.en_retard`);
  else if (f.etat) { p.push(f.etat); w.push(`s.etat = $${p.length}`); }
  const rows = await q(`${SQL_FACTURES.replace("select f.id,", `select f.dossier_id, d.ref, coalesce(f.origine_client_id, d.client_id) as origine_id,
        coalesce(f.payeur_client_id, (f.payeur->>'clientId')::int) as payeur_id,
        coalesce(c.societe, nullif(trim(coalesce(c.prenom,'') || ' ' || coalesce(c.nom,'')), ''), gm.client, 'Sans client') as origine_nom, f.id,`)}
      left join dossiers d on d.id = f.dossier_id left join clients c on c.id = coalesce(f.origine_client_id, d.client_id)
      left join garde_meuble gm on gm.id = f.garde_meuble_id
      ${w.length ? "where " + w.join(" and ") : ""} order by f.emise_le desc, f.id desc limit 300`, p);
  return rows.map((r) => ({ ...versFacture(r), dossierId: r.dossier_id, ref: r.ref, origineNom: r.origine_nom, origineId: r.origine_id, payeurId: r.payeur_id, payeurNomAffiche: r.payeur_nom ?? r.origine_nom }));
}

export interface FiltresReglements { mode?: string | null; nature?: string | null; dossier?: number | null; q?: string | null; affectation?: "libres" | "affectes" | null }
export interface LigneListeReglement extends ReglementVue { ref: string; client: string }

export async function listeReglements(f: FiltresReglements = {}): Promise<LigneListeReglement[]> {
  const w: string[] = [], p: unknown[] = [];
  if (f.mode) { p.push(f.mode); w.push(`p.mode = $${p.length}`); }
  if (f.nature) { p.push(f.nature); w.push(`p.nature = $${p.length}`); }
  if (f.dossier) { p.push(f.dossier); w.push(`p.dossier_id = $${p.length}`); }
  if (f.affectation === "libres") w.push("p.facture_id is null");
  if (f.affectation === "affectes") w.push("p.facture_id is not null");
  if (f.q) {
    p.push(`%${f.q}%`);
    w.push(`(p.libelle ilike $${p.length} or p.numero_cheque ilike $${p.length} or p.banque ilike $${p.length} or p.titulaire ilike $${p.length} or d.ref ilike $${p.length} or c.nom ilike $${p.length} or c.societe ilike $${p.length} or f.numero ilike $${p.length})`);
  }
  const rows = await q(`${SQL_REGLEMENTS.replace("select p.id,", "select d.ref, coalesce(c.societe, nullif(trim(coalesce(c.prenom,'') || ' ' || coalesce(c.nom,'')), ''), 'Sans nom') as client, p.id,")}
      join dossiers d on d.id = p.dossier_id join clients c on c.id = d.client_id
      ${w.length ? "where " + w.join(" and ") : ""} order by p.recu_le desc, p.id desc limit 300`, p);
  return rows.map((r) => ({ ...versReglement(r), ref: r.ref, client: r.client }));
}

/** Les compteurs du menu de la page Factures (sur un dossier, ou partout). */
export async function compteursFacturation(dossier?: number | null) {
  const w = dossier ? "where dossier_id = $1" : "";
  const p = dossier ? [dossier] : [];
  const [f] = await q(`select count(*) filter (where genre in ('facture','solde','acompte'))::int as factures, count(*) filter (where genre='acompte')::int as acomptes,
      count(*) filter (where genre='avoir')::int as avoirs, count(*) filter (where genre <> 'avoir' and statut not in ('payee','annulee'))::int as ouvertes from factures ${w}`, p);
  const [r] = await q(`select count(*)::int as reglements, count(*) filter (where nature='arrhes')::int as arrhes from paiements ${w}`, p);
  return { factures: f.factures, acomptes: f.acomptes, avoirs: f.avoirs, ouvertes: f.ouvertes, reglements: r.reglements, arrhes: r.arrhes };
}

/** Les dossiers signés dont aucune arrhe n'est encore arrivée : ce que l'équipe attend. */
export async function arrhesAttendues(dossier?: number | null) {
  return q(`select d.id, d.ref, d.statut, v.numero, v.montant::float8 as montant, v.signe_le, c.nom, c.prenom, c.societe
      from dossiers d join clients c on c.id = d.client_id join devis v on v.dossier_id = d.id and v.statut = 'signe'
     where d.statut in ('commande','planifie') and not exists (select 1 from paiements p where p.dossier_id = d.id and p.nature = 'arrhes')
       ${dossier ? "and d.id = $1" : ""} order by v.signe_le desc nulls last limit 50`, dossier ? [dossier] : []);
}

/** Les clients qui peuvent payer pour un autre : recherche par nom, société, e-mail ou SIREN. */
export async function chercherClients(texte: string, exclure?: number | null) {
  const t = texte.trim();
  const p: unknown[] = [];
  let w = "true";
  if (t) {
    p.push(`%${t}%`);
    w = `(societe ilike $1 or nom ilike $1 or prenom ilike $1 or email ilike $1 or siren ilike $1)`;
  }
  if (exclure) { p.push(exclure); w += ` and id <> $${p.length}`; }
  const rows = await q(`select ${COLS_CLIENT} from clients where ${w}
      order by case type when 'compte' then 0 when 'partenaire' then 1 else 2 end, coalesce(societe, nom) limit 12`, p);
  return rows.map((r) => payeurDe(r)!);
}

export const ventilerParPayeur = (rows: LigneListeFacture[], cle: "payeur" | "origine") => {
  const groupes = new Map<string, { nom: string; id: number | null; lignes: LigneListeFacture[] }>();
  for (const r of rows) {
    const id = cle === "payeur" ? r.payeurId : r.origineId;
    const nom = cle === "payeur" ? r.payeurNomAffiche : r.origineNom;
    const k = `${id ?? nom}`;
    if (!groupes.has(k)) groupes.set(k, { nom, id, lignes: [] });
    groupes.get(k)!.lignes.push(r);
  }
  return [...groupes.values()].sort((a, b) => b.lignes.reduce((s, x) => s + x.reste, 0) - a.lignes.reduce((s, x) => s + x.reste, 0) || a.nom.localeCompare(b.nom, "fr"));
};
