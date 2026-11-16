import "server-only";
import type { Db, Row } from "@/crm/lib/db";
import { anneeParis } from "@/crm/lib/format";
import { lireAchats, lireAssurance, lireInternational, lireLignes, lireMoyens, lirePrestations, nouvelId } from "./modele";
import { calculer, lignesPourBase } from "./calcul";
import { effectifs, type ParametresDevis } from "./parametres";

/*
 * La duplication d'un devis, une seule fois pour tout le CRM : « Dupliquer »
 * sur un devis (fiche du dossier, liste /devis, éditeur), « Dupliquer un
 * devis » à la création d'un devis, et « Dupliquer à l'identique » un dossier
 * avec ses devis. Elle s'écrit dans la transaction qu'on lui passe : une
 * duplication de dossier pose le dossier, son trajet, son inventaire et ses
 * devis d'un seul tenant.
 *
 * Le devis repart en brouillon, avec le numéro suivant (DV-année-n°), daté du
 * jour et valable selon les Paramètres du devis. Il reprend le chiffrage
 * (lignes, remise, assurance), les prestations, les conditions et les achats
 * prévus. D'un autre dossier, rien de ce qui tient au déménagement d'origine
 * ne suit : distance, poids lourds, déplacement, groupage, référence interne,
 * moyens, valeurs déclarées, coûts réels des achats. Jamais : l'envoi, la
 * signature, le lien de signature, la validation (arrhes) ni le commentaire
 * interne.
 *
 * Les montants sont ceux des lignes, recalculés comme l'éditeur les calcule
 * (remise, assurance, TVA) : l'éditeur ne les déduit pas du volume. Quand le
 * volume du dossier de destination diffère, ils sont donc repris tels quels,
 * à vérifier (`volumeDiffere`).
 */

const aujourdhui = () => new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Paris" });
const plusJours = (j: number) => {
  const d = new Date(`${aujourdhui()}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + j);
  return d.toISOString().slice(0, 10);
};

/** Le numéro suivant, sous un verrou propre à la transaction : deux duplications simultanées ne prennent pas le même. */
export async function numeroDevis(db: Db) {
  await db.query("select pg_advisory_xact_lock(hashtext('bailly.crm.numero.DV'))");
  const an = anneeParis();
  const [r] = await db.query<{ n: number }>("select coalesce(max(substring(numero from '[0-9]+$')::int),0) + 1 as n from devis where numero like $1", [`DV-${an}-%`]);
  return `DV-${an}-${String(r.n).padStart(4, "0")}`;
}

export interface CopieDevis {
  id: number;
  numero: string;
  memeDossier: boolean;
  /** Le volume des deux dossiers diffère : montants repris tels quels, à vérifier. */
  volumeDiffere: boolean;
  source: { id: number; numero: string; dossierId: number; ref: string; client: string; volume: number };
  cible: { id: number; volume: number };
}

/**
 * Copie le devis `sourceId` dans le dossier `cibleId`, en brouillon. Rend
 * null si l'un des deux n'existe pas. `memeDemenagement` : le dossier de
 * destination est la copie à l'identique de celui du devis (même trajet,
 * même inventaire) ; ce qui tient au déménagement suit alors comme dans le
 * même dossier.
 */
export async function copierDevisDans(
  db: Db, sourceId: number, cibleId: number, p: ParametresDevis, u: { id: number; role: string }, opts: { memeDemenagement?: boolean } = {},
): Promise<CopieDevis | null> {
  const [src] = await db.query<Row>(
    `select v.*, v.remise_pct::float8 as remise_pct, v.arrhes_pct::float8 as arrhes_pct, d.ref, d.volume::float8 as volume_dossier,
        coalesce(nullif(c.societe, ''), concat_ws(' ', c.prenom, c.nom)) as client
       from devis v join dossiers d on d.id = v.dossier_id join clients c on c.id = d.client_id where v.id = $1`,
    [sourceId],
  );
  if (!src) return null;
  const [d] = await db.query<Row>(
    `select d.id, d.volume::float8 as volume, d.commercial_id,
        (select debut from rendez_vous where dossier_id = d.id and type in ('phys','visio') order by debut desc limit 1) as visite,
        (select distance_km from devis where dossier_id = d.id and distance_km is not null order by cree_le desc limit 1) as distance_km
       from dossiers d where d.id = $1`,
    [cibleId],
  );
  if (!d) return null;

  const memeDossier = src.dossier_id === d.id;
  const memeDemenagement = memeDossier || !!opts.memeDemenagement;
  const eff = effectifs(p);
  const assurance = lireAssurance(src.assurance);
  if (!memeDemenagement) {
    assurance.contractuelle.valeur = null;
    assurance.dommage.valeur = null;
  }
  const achats = lireAchats(src.achats, src.lignes).map((a) => ({ ...a, id: nouvelId("h"), reel: null, date: "", piece: "" }));
  // Les lignes gardent leurs champs ; leurs identifiants sont renouvelés, l'assurance recalculée.
  const lignes = lireLignes(src.lignes).map((l) => ({ ...l, id: nouvelId() }));
  const chiffrage = {
    mode: src.mode === "forfait" ? ("forfait" as const) : ("postes" as const),
    saisie: src.saisie === "ht" ? ("ht" as const) : ("ttc" as const),
    remisePct: src.remise_pct ?? 0,
    lignes,
    assurance,
  };
  const calcul = calculer(chiffrage, eff.tvaAssurance);

  const colonnes: Record<string, unknown> = {
    dossier_id: d.id,
    commercial_id: d.commercial_id ?? (u.role === "commercial" ? u.id : null),
    date_devis: aujourdhui(),
    date_visite: d.visite ? new Date(d.visite).toLocaleDateString("en-CA", { timeZone: "Europe/Paris" }) : null,
    validite: plusJours(eff.validiteJours),
    distance_km: d.distance_km ?? null,
    maj_le: new Date().toISOString(),
    formule: src.formule,
    titre: src.titre,
    categorie_specifique: src.categorie_specifique,
    categorie_libelle: src.categorie_libelle,
    origine: "copie",
    copie_de: src.id,
    saisie: chiffrage.saisie,
    mode: chiffrage.mode,
    remise_pct: chiffrage.remisePct,
    lignes: lignesPourBase(chiffrage, calcul, assurance.tva ?? eff.tvaAssurance),
    montant: calcul.ttc,
    montant_ht: calcul.ht,
    montant_tva: calcul.tva,
    prestations: lirePrestations(src.prestations),
    assurance,
    achats,
    arrhes_pct: src.arrhes_pct ?? eff.arrhesPct,
    reglement_solde: src.reglement_solde,
    conditions: src.conditions,
    international: lireInternational(src.international),
    ...(memeDemenagement
      ? { distance_km: src.distance_km, poids_lourds: src.poids_lourds, deplacement: src.deplacement, groupage: src.groupage, ref_interne: src.ref_interne, moyens: lireMoyens(src.moyens) }
      : {}),
  };
  colonnes.numero = await numeroDevis(db);
  const cles = Object.keys(colonnes);
  const [r] = await db.query<{ id: number }>(
    `insert into devis(${cles.join(",")}) values(${cles.map((_, i) => `$${i + 1}`).join(",")}) returning id`,
    cles.map((k) => {
      const v = colonnes[k];
      return v !== null && typeof v === "object" ? JSON.stringify(v) : v;
    }),
  );
  const volSource = Number(src.volume_dossier) || 0;
  const volCible = Number(d.volume) || 0;
  return {
    id: r.id,
    numero: String(colonnes.numero),
    memeDossier,
    volumeDiffere: !memeDemenagement && Math.abs(volSource - volCible) > 0.05,
    source: { id: src.id, numero: src.numero, dossierId: src.dossier_id, ref: src.ref, client: src.client, volume: volSource },
    cible: { id: d.id, volume: volCible },
  };
}
