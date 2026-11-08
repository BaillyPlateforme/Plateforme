import "server-only";
import { q, q1, type Row } from "@/crm/lib/db";
import {
  lireAchats, lireAssurance, lireInternational, lireLignes, lireMoyens, lirePrestations,
  type EtatDevis, type Etape, type Formule,
} from "./modele";
import { CLES_PARAMETRES, PARAMETRES_VIDES, effectifs, type ParametresDevis } from "./parametres";
import { calculer } from "./calcul";

/*
 * Les lectures du module Devis : la fenêtre d'un devis, la liste (dossier ou
 * générale), les modèles à copier, les paramètres. Toutes dans le schéma
 * `crm`, comme le reste du CRM.
 */

const jour = (d: unknown) => (d ? new Date(d as string).toISOString().slice(0, 10) : "");

export async function lireParametres(): Promise<ParametresDevis> {
  const lignes = await q<{ cle: string; valeur: unknown }>("select cle, valeur from devis_parametres");
  const p: Record<string, unknown> = { ...PARAMETRES_VIDES };
  for (const { cle, valeur } of lignes) {
    if (!(CLES_PARAMETRES as string[]).includes(cle)) continue;
    const k = cle as keyof ParametresDevis;
    const vide = PARAMETRES_VIDES[k];
    if (Array.isArray(vide)) p[k] = Array.isArray(valeur) ? valeur.map(String).filter(Boolean) : [];
    else if (typeof vide === "string") p[k] = typeof valeur === "string" ? valeur : "";
    else p[k] = typeof valeur === "number" && Number.isFinite(valeur) ? valeur : null;
  }
  return p as unknown as ParametresDevis;
}

/** La date de la dernière visite (sur place ou en visio) du dossier. */
async function dateVisite(dossierId: number) {
  const r = await q1<{ debut: Date }>("select debut from rendez_vous where dossier_id=$1 and type in ('phys','visio') order by debut desc limit 1", [dossierId]);
  return r ? new Date(r.debut).toLocaleDateString("en-CA", { timeZone: "Europe/Paris" }) : "";
}

export async function etapesDuDossier(dossierId: number): Promise<Etape[]> {
  const rows = await q("select * from etapes_trajet where dossier_id=$1 order by ordre, id", [dossierId]);
  return rows.map((e) => ({
    id: e.id, genre: e.genre, adresse: e.adresse ?? "", codePostal: e.code_postal ?? "", ville: e.ville ?? "", pays: e.pays ?? "",
    telephone: e.telephone ?? "", etage: e.etage ?? "", ascenseur: !!e.ascenseur, monteCharge: !!e.monte_charge, transbordement: !!e.transbordement,
    portage: e.portage_m ?? null, monteMeuble: e.monte_meuble ?? "", stationnement: e.stationnement ?? "", acces: e.acces ?? "",
  }));
}

/** Un devis, tel que sa fenêtre l'édite : l'état complet, et ce qui l'entoure. */
export async function chargerDevis(devisId: number) {
  if (!Number.isSafeInteger(devisId) || devisId <= 0) return null;
  const v = await q1(`select v.*, v.montant::float8 as montant, v.remise_pct::float8 as remise_pct, v.arrhes_pct::float8 as arrhes_pct,
      d.ref, d.id as did, d.volume::float8 as volume, d.statut as dossier_statut, d.type_demenagement, d.passer_en_dernier, d.origine_demande, d.observations,
      d.date_chargement, d.date_livraison, d.periode, d.request_id, d.commercial_id as dossier_commercial,
      c.id as client_id, c.type as client_type, c.civilite, c.nom, c.prenom, c.societe, c.email, c.telephone
    from devis v join dossiers d on d.id=v.dossier_id join clients c on c.id=d.client_id where v.id=$1`, [devisId]);
  if (!v) return null;
  const [parametres, etapes, visite, utilisateurs, autres, historique] = await Promise.all([
    lireParametres(),
    etapesDuDossier(v.did),
    dateVisite(v.did),
    q<{ id: number; nom: string; initiales: string; role: string }>("select id, nom, initiales, role from utilisateurs order by nom"),
    q("select id, numero, formule, titre, statut, montant::float8 as montant, retire_le, categorie_specifique, categorie_libelle from devis where dossier_id=$1 order by cree_le, id", [v.did]),
    q("select a.libelle, a.cree_le, u.nom from activite a left join utilisateurs u on u.id=a.utilisateur_id where a.dossier_id=$1 and a.libelle like $2 order by a.cree_le desc limit 30", [v.did, `%${v.numero}%`]),
  ]);
  const eff = effectifs(parametres);
  const validite = v.validite ? jour(v.validite) : "";
  const etat: EtatDevis = {
    contrat: {
      titre: v.titre ?? "",
      formule: v.formule as Formule,
      categorieSpecifique: !!v.categorie_specifique,
      categorieLibelle: v.categorie_libelle ?? "",
      commercialId: v.commercial_id ?? v.dossier_commercial ?? null,
      dateDevis: v.date_devis ? jour(v.date_devis) : new Date(v.cree_le).toLocaleDateString("en-CA", { timeZone: "Europe/Paris" }),
      dateVisite: v.date_visite ? jour(v.date_visite) : visite,
      validite,
      distanceKm: v.distance_km ?? null,
      poidsLourds: v.poids_lourds ?? "",
      deplacement: v.deplacement === "urbain" ? "urbain" : "route",
      groupage: !!v.groupage,
      arrhesPct: v.arrhes_pct ?? eff.arrhesPct,
      reglementSolde: v.reglement_solde ?? "",
      conditions: v.conditions ?? "",
      commentaireInterne: v.commentaire_interne ?? "",
      refInterne: v.ref_interne ?? "",
    },
    chiffrage: {
      mode: v.mode === "forfait" ? "forfait" : "postes",
      saisie: v.saisie === "ht" ? "ht" : "ttc",
      remisePct: v.remise_pct ?? 0,
      lignes: lireLignes(v.lignes),
      assurance: lireAssurance(v.assurance),
    },
    prestations: lirePrestations(v.prestations),
    achats: lireAchats(v.achats, v.lignes),
    moyens: lireMoyens(v.moyens),
    international: lireInternational(v.international),
    etapes,
    dossier: {
      typeDemenagement: v.type_demenagement ?? "national",
      typeClient: v.client_type ?? "particulier",
      passerEnDernier: !!v.passer_en_dernier,
      origineDemande: v.origine_demande ?? (v.request_id ? "Site internet" : ""),
      observations: v.observations ?? "",
      dateChargement: v.date_chargement ? jour(v.date_chargement) : "",
      dateLivraison: v.date_livraison ? jour(v.date_livraison) : "",
    },
  };
  const suggestions = await lireSuggestions(parametres);
  return {
    v: {
      id: v.id as number, numero: v.numero as string, statut: v.statut as string, token: (v.token as string | null) ?? null,
      envoye_le: v.envoye_le ? new Date(v.envoye_le).toISOString() : null, signe_le: v.signe_le ? new Date(v.signe_le).toISOString() : null,
      retire_le: v.retire_le ? new Date(v.retire_le).toISOString() : null, maj_le: v.maj_le ? new Date(v.maj_le).toISOString() : null,
      montant: v.montant as number, validation: (v.validation as Row | null) ?? null, origine: (v.origine as string | null) ?? null,
    },
    dossier: {
      id: v.did as number, ref: v.ref as string, statut: v.dossier_statut as string, volume: v.volume as number, periode: (v.periode as string | null) ?? null,
      client: { id: v.client_id as number, civilite: v.civilite, nom: v.nom, prenom: v.prenom, societe: v.societe, email: v.email, telephone: v.telephone },
    },
    etat,
    parametres,
    utilisateurs,
    autres: autres.map((a) => ({ ...a, retire_le: a.retire_le ? String(a.retire_le) : null })) as Row[],
    historique: historique.map((h) => ({ libelle: h.libelle as string, le: new Date(h.cree_le).toISOString(), nom: (h.nom as string | null) ?? null })),
    suggestions,
  };
}
export type DevisCharge = NonNullable<Awaited<ReturnType<typeof chargerDevis>>>;

/** Les listes proposées à la saisie : paramètres de Bailly, puis ce que l'équipe a déjà saisi. */
async function lireSuggestions(p: ParametresDevis) {
  const [fournisseurs, comptes, origines, reglements] = await Promise.all([
    q<{ v: string }>("select distinct a->>'fournisseur' as v from devis, jsonb_array_elements(case when jsonb_typeof(achats)='array' then achats else '[]'::jsonb end) a where coalesce(a->>'fournisseur','') <> '' order by 1 limit 80"),
    q<{ v: string }>("select distinct a->>'compte' as v from devis, jsonb_array_elements(case when jsonb_typeof(achats)='array' then achats else '[]'::jsonb end) a where coalesce(a->>'compte','') <> '' order by 1 limit 40"),
    q<{ v: string }>("select distinct origine_demande as v from dossiers where coalesce(origine_demande,'') <> '' order by 1 limit 40"),
    q<{ v: string }>("select distinct reglement_solde as v from devis where coalesce(reglement_solde,'') <> '' order by 1 limit 40"),
  ]);
  const uniq = (...l: string[][]) => [...new Set(l.flat().map((s) => s.trim()).filter(Boolean))];
  return {
    fournisseurs: uniq(fournisseurs.map((r) => r.v)),
    comptes: uniq(p.comptes, comptes.map((r) => r.v)),
    origines: uniq(p.origines, origines.map((r) => r.v)),
    reglementsSolde: uniq(p.reglementsSolde, reglements.map((r) => r.v)),
    modesReglement: uniq(p.modesReglement),
  };
}

/**
 * Les devis d'un dossier, tels que le document imprimé et la page de
 * signature les lisent : toutes les colonnes, montants en nombres.
 */
export async function devisPourDocument(dossierId: number) {
  return q(`select v.*, v.montant::float8 as montant, v.montant_ht::float8 as montant_ht, v.montant_tva::float8 as montant_tva,
      v.remise_pct::float8 as remise_pct, v.arrhes_pct::float8 as arrhes_pct, u.nom as commercial_devis
    from devis v left join utilisateurs u on u.id=v.commercial_id where v.dossier_id=$1 order by v.montant desc, v.id`, [dossierId]);
}

/** La liste des devis : d'un dossier, ou de tous, avec les colonnes de Créagidem. */
export async function listeDevis(f: { dossier?: number | null; statut?: string | null; signatures?: boolean }) {
  const w: string[] = [], p: unknown[] = [];
  if (f.dossier) { p.push(f.dossier); w.push(`v.dossier_id=$${p.length}`); }
  if (f.statut === "retire") w.push("v.retire_le is not null");
  else if (f.statut) { p.push(f.statut); w.push(`v.statut=$${p.length} and v.retire_le is null`); }
  if (f.signatures) w.push("v.token is not null");
  return q(`select v.id, v.numero, v.formule, v.titre, v.categorie_specifique, v.categorie_libelle, v.statut, v.mode, v.saisie, v.retire_le, v.origine,
      v.montant::float8 as montant, v.montant_ht::float8 as montant_ht, v.envoye_le, v.signe_le, v.token, v.ref_interne,
      coalesce(v.date_devis, v.cree_le::date) as date_devis, v.cree_le, v.lignes,
      d.id as did, d.ref, d.volume::float8 as volume, d.date_chargement, d.date_livraison, d.periode,
      c.nom, c.prenom, c.societe, coalesce(u.initiales, cu.initiales) as com,
      (select coalesce(ville, adresse) from etapes_trajet where dossier_id=d.id and genre='depart' order by ordre limit 1) as depart,
      (select coalesce(ville, adresse) from etapes_trajet where dossier_id=d.id and genre='arrivee' order by ordre desc limit 1) as arrivee
    from devis v join dossiers d on d.id=v.dossier_id join clients c on c.id=d.client_id
      left join utilisateurs u on u.id=v.commercial_id left join utilisateurs cu on cu.id=d.commercial_id
    ${w.length ? "where " + w.join(" and ") : ""} order by v.cree_le desc, v.id desc limit 300`, p);
}

/** HT d'un devis : la colonne enregistrée, sinon le calcul de ses lignes (devis d'avant). */
export function htDe(r: Row) {
  if (r.montant_ht != null) return Number(r.montant_ht);
  const lignes = lireLignes(r.lignes);
  return calculer({ mode: "postes", saisie: r.saisie === "ht" ? "ht" : "ttc", remisePct: 0, lignes, assurance: lireAssurance({}) }, 20).ht;
}

/** Les devis à copier : n'importe quel dossier, par nom de client, société, numéro de devis ou de dossier. */
export async function chercherModeles(texte: string, exclure?: number) {
  const t = texte.trim().slice(0, 80);
  const p: unknown[] = t ? [`%${t}%`] : [];
  const where = t ? "(c.nom ilike $1 or c.prenom ilike $1 or c.societe ilike $1 or v.numero ilike $1 or d.ref ilike $1 or coalesce(v.titre,'') ilike $1)" : "true";
  if (exclure) p.push(exclure);
  return q(`select v.id, v.numero, v.formule, v.titre, v.categorie_specifique, v.categorie_libelle, v.statut, v.montant::float8 as montant, v.mode,
      d.id as did, d.ref, d.volume::float8 as volume, c.nom, c.prenom, c.societe,
      jsonb_array_length(case when jsonb_typeof(v.lignes)='array' then v.lignes else '[]'::jsonb end) as nb_lignes
    from devis v join dossiers d on d.id=v.dossier_id join clients c on c.id=d.client_id
    where ${where} ${exclure ? `and v.id <> $${p.length}` : ""} order by v.cree_le desc, v.id desc limit 12`, p);
}
