import "server-only";
import { q, type Db, type Row } from "@/crm/lib/db";
import { journaliser } from "@/crm/lib/journal";
import { copierDevisDans } from "@/crm/devis/copie";
import { lireParametres } from "@/crm/devis/donnees";
import { copierCimob } from "@/crm/cimob/donnees";

/*
 * La duplication d'un dossier. Elle passe par la création ordinaire
 * (creerDossier, src/crm/actions.ts) : un seul chemin pose le client, le
 * dossier et ses premières étapes, quel que soit le point de départ. Le
 * formulaire porte `dupliquer_depuis` (le dossier d'origine) et le mode :
 *
 * - « à l'identique » (`dupliquer_mode=identique`, depuis le « ⋯ » du
 *   dossier) : le même client ; le dossier reprend tout ce qui décrit le
 *   déménagement — trajet complet, inventaire et ses pièces, volume, type,
 *   options, services, observations, période, commercial — relu ici dans la
 *   base, jamais dans le navigateur. Les devis suivent en brouillon si on le
 *   demande (`dupliquer_devis`) ;
 * - « pour un nouveau client » (`dupliquer_mode=nouveau`, l'écran
 *   /dossiers/nouveau?depuis=<id>) : ce que l'écran a prérempli et que
 *   l'utilisateur a gardé, plus ce qui ne tient pas dans le formulaire — le
 *   détail des accès et les étapes intermédiaires (case « Trajet et accès »),
 *   l'inventaire (case « Inventaire »). Jamais le téléphone d'une étape :
 *   c'est celui de l'autre foyer. Le repli et les véhicules d'un CIMOB/DICOM
 *   ne suivent pas non plus : ce sont le logement et les véhicules de
 *   l'autre militaire (l'écran les fait saisir pour le nouveau).
 *
 * Jamais repris : signature, factures, règlements, visites et rendez-vous,
 * lettres de voiture, dates de chargement et de livraison, pièces jointes et
 * photos, espace client, litiges.
 *
 * Tout s'écrit dans la transaction de la création : le dossier naît entier,
 * ou pas du tout.
 */

const COLS_ETAPE =
  "genre, adresse, etage, ascenseur, acces, escalier, portage_m, stationnement, poids_lourd, monte_meuble, code_postal, ville, pays, telephone, monte_charge, transbordement" +
  // La fiche du premier appel (retours de Céline, 16/11/2026) ; le département d'outre-mer (CIMOB/DICOM, 17/11/2026) ;
  // la case Port (18/11/2026).
  ", ascenseur_taille, portage, code_acces, surface_m2, acces_camion, departement_om, port";
const DETAIL_ACCES = "escalier, portage_m, stationnement, poids_lourd, monte_meuble, code_postal, ville, pays, monte_charge, transbordement, departement_om";

/** Ce qu'une duplication a fait, pour le fil du dossier et le journal. */
export interface Duplication {
  sourceId: number;
  sourceRef: string;
  mode: "identique" | "nouveau";
  activite: string;
  details: Record<string, unknown>;
}

const oui = (f: FormData, k: string) => f.get(k) === "on";
const entier = (f: FormData, k: string) => {
  const v = Number(f.get(k));
  return Number.isSafeInteger(v) && v > 0 ? v : null;
};
const meme = (a: unknown, b: unknown) => String(a ?? "").trim().toLowerCase() === String(b ?? "").trim().toLowerCase();
const pluriel = (n: number, un: string, plusieurs = `${un}s`) => `${n} ${n > 1 ? plusieurs : un}`;

/** Tout le trajet du dossier d'origine, étape par étape, à la place des étapes posées par la création. */
async function copierTrajet(db: Db, source: number, cible: number) {
  await db.query("delete from etapes_trajet where dossier_id=$1", [cible]);
  const r = await db.query(
    `insert into etapes_trajet(dossier_id, ordre, ${COLS_ETAPE}) select $2, ordre, ${COLS_ETAPE} from etapes_trajet where dossier_id=$1 order by ordre, id returning id`,
    [source, cible],
  );
  return r.length;
}

/**
 * Pour un nouveau client : le départ et l'arrivée saisis à l'écran restent ;
 * s'ils sont ceux du dossier d'origine, ils en reprennent le détail des accès
 * (code postal, escalier, stationnement, monte-meuble…). Les étapes
 * intermédiaires suivent, sans téléphone.
 */
async function enrichirTrajet(db: Db, source: number, cible: number) {
  const src = await db.query<Row>("select * from etapes_trajet where dossier_id=$1 order by ordre, id", [source]);
  const neuves = await db.query<Row>("select id, genre, adresse from etapes_trajet where dossier_id=$1", [cible]);
  let detailles = 0;
  for (const genre of ["depart", "arrivee"] as const) {
    const s = genre === "depart" ? src.find((e) => e.genre === "depart") : [...src].reverse().find((e) => e.genre === "arrivee");
    const n = neuves.find((e) => e.genre === genre);
    if (!s || !n || !s.adresse || !meme(s.adresse, n.adresse)) continue;
    await db.query(`update etapes_trajet e set (${DETAIL_ACCES}) = (select ${DETAIL_ACCES} from etapes_trajet where id=$2) where e.id=$1`, [n.id, s.id]);
    detailles++;
  }
  const autres = await db.query(
    `insert into etapes_trajet(dossier_id, ordre, ${COLS_ETAPE})
     select $2, 1, ${COLS_ETAPE.replace("telephone", "null")} from etapes_trajet where dossier_id=$1 and genre='autre' order by ordre, id returning id`,
    [source, cible],
  );
  return { detailles, intermediaires: autres.length };
}

/** L'inventaire et ses pièces : chaque objet rejoint la copie de sa pièce ; les clés de synchronisation sont neuves. */
async function copierInventaire(db: Db, source: number, cible: number) {
  const pieces = await db.query<{ id: number; nom: string; ordre: number; remarque: string | null; destination_speciale: string | null }>(
    "select id, nom, ordre, remarque, destination_speciale from pieces where dossier_id=$1 order by ordre, id",
    [source],
  );
  const correspondance: Record<string, number> = {};
  for (const p of pieces) {
    const [n] = await db.query<{ id: number }>("insert into pieces(dossier_id, nom, ordre, remarque, destination_speciale) values($1,$2,$3,$4,$5) returning id", [cible, p.nom, p.ordre, p.remarque, p.destination_speciale]);
    correspondance[String(p.id)] = n.id;
  }
  // Les destinations hors adresse, la désignation anglaise et le hors-cubage (tablette, 18/11/2026) suivent la ligne.
  const objets = await db.query(
    `insert into inventaire(dossier_id, piece, libelle, quantite, volume, destination, demontage, cle, piece_id, fragile, note, ordre, destination_speciale, libelle_en, hors_cubage)
     select $2, piece, libelle, quantite, volume, destination, demontage, case when cle is null then null else gen_random_uuid() end,
            ($3::jsonb ->> piece_id::text)::int, fragile, note, ordre, destination_speciale, libelle_en, hors_cubage
       from inventaire where dossier_id=$1 order by ordre, id returning id`,
    [source, cible, JSON.stringify(correspondance)],
  );
  return { objets: objets.length, pieces: pieces.length };
}

/** Les services complémentaires, remis « prévus », sans date (celles du déménagement d'origine). Les services annulés restent. */
async function copierServices(db: Db, source: number, cible: number) {
  const r = await db.query(
    "insert into services(dossier_id, libelle, date_prevue, montant, statut, notes) select $2, libelle, null, montant, 'prevu', notes from services where dossier_id=$1 and statut <> 'annule' order by id returning id",
    [source, cible],
  );
  return r.length;
}

/**
 * Appelée par creerDossier, dans sa transaction, juste après l'insertion du
 * dossier `nouveauId` (client `clientId`). Sans `dupliquer_depuis`, rien.
 */
export async function reprendreDuplication(db: Db, nouveauId: number, clientId: number, u: { id: number; role: string }, f: FormData): Promise<Duplication | null> {
  const sourceId = entier(f, "dupliquer_depuis");
  if (!sourceId) return null;
  const [o] = await db.query<Row>("select * from dossiers where id=$1", [sourceId]);
  if (!o) throw new Error("Le dossier à dupliquer n'existe plus : rien n'a été créé.");
  const mode = f.get("dupliquer_mode") === "identique" ? "identique" : "nouveau";

  if (mode === "identique") {
    // À l'identique, c'est le même client : sinon, ce serait une duplication pour un nouveau client.
    if (o.client_id !== clientId) throw new Error("Une duplication à l'identique garde le client du dossier d'origine : rien n'a été créé.");
    await db.query(
      `update dossiers n set commercial_id=o.commercial_id, traite_par_id=o.traite_par_id, periode=o.periode, mois_ca=o.mois_ca, volume=o.volume,
          observations=o.observations, type_demenagement=o.type_demenagement, vehicule=o.vehicule, passer_en_dernier=o.passer_en_dernier,
          origine_demande=o.origine_demande, volume_droits=o.volume_droits, distance_km=o.distance_km,
          distance_vers_port_km=o.distance_vers_port_km, distance_mer_km=o.distance_mer_km, distance_depuis_port_km=o.distance_depuis_port_km, statut='prospect'
         from dossiers o where n.id=$1 and o.id=$2`,
      [nouveauId, sourceId],
    );
    const etapes = await copierTrajet(db, sourceId, nouveauId);
    const inv = await copierInventaire(db, sourceId, nouveauId);
    const services = await copierServices(db, sourceId, nouveauId);
    // CIMOB/DICOM (src/crm/cimob) : le repli et les véhicules du même client suivent.
    const cimob = await copierCimob(db, sourceId, nouveauId);
    const devis: string[] = [];
    if (oui(f, "dupliquer_devis")) {
      const p = await lireParametres(db);
      const sources = await db.query<{ id: number }>("select id from devis where dossier_id=$1 and retire_le is null order by cree_le, id", [sourceId]);
      for (const v of sources) {
        // Le même déménagement : distance, poids lourds, moyens et valeurs déclarées suivent, comme dans le même dossier.
        const c = await copierDevisDans(db, v.id, nouveauId, p, u, { memeDemenagement: true });
        if (c) devis.push(`${c.source.numero} → ${c.numero}`);
      }
    }
    const repris = [
      pluriel(etapes, "étape"),
      inv.objets ? `inventaire (${pluriel(inv.objets, "objet")})` : null,
      services ? pluriel(services, "service") : null,
      cimob.repli ? "repli" : null,
      cimob.vehicules ? pluriel(cimob.vehicules, "véhicule") : null,
      "options, observations, période et commercial",
      devis.length ? `${pluriel(devis.length, "devis", "devis")} en brouillon` : null,
    ].filter(Boolean);
    return {
      sourceId, sourceRef: o.ref, mode,
      activite: `Dossier dupliqué depuis ${o.ref} à l'identique · repris : ${repris.join(", ")}`,
      details: { source: o.ref, mode, etapes, objets: inv.objets, pieces: inv.pieces, services, devis, repli: cimob.repli, vehicules: cimob.vehicules },
    };
  }

  // Pour un nouveau client : ce que les cases ont gardé.
  const trajet = oui(f, "dupliquer_trajet");
  const inventaire = oui(f, "dupliquer_inventaire");
  const t = trajet ? await enrichirTrajet(db, sourceId, nouveauId) : null;
  const inv = inventaire ? await copierInventaire(db, sourceId, nouveauId) : null;
  const repris = [
    trajet ? `trajet et accès${t?.intermediaires ? ` (+ ${pluriel(t.intermediaires, "étape")})` : ""}` : null,
    inv ? `inventaire (${pluriel(inv.objets, "objet")})` : null,
    oui(f, "dupliquer_options") ? "options et type" : null,
    oui(f, "dupliquer_observations") ? "observations" : null,
  ].filter(Boolean);
  return {
    sourceId, sourceRef: o.ref, mode,
    activite: `Dossier dupliqué depuis ${o.ref} pour un nouveau client · ${repris.length ? `repris : ${repris.join(", ")}` : "rien d'autre que la saisie"}`,
    details: { source: o.ref, mode, trajet, inventaire, objets: inv?.objets, options: oui(f, "dupliquer_options"), observations: oui(f, "dupliquer_observations") },
  };
}

/**
 * Après la création : le dossier d'origine garde la trace de sa copie (sans
 * commencer par « Dossier dupliqué », la naissance d'un dossier pour le Feed
 * et le Parcours), et le geste entre au journal.
 */
export async function apresDuplication(nouveauId: number, ref: string, d: Duplication, utilisateurId: number) {
  await q("insert into activite(dossier_id, utilisateur_id, libelle) values($1,$2,$3)", [
    d.sourceId, utilisateurId, `Dupliqué vers ${ref} (${d.mode === "identique" ? "à l'identique" : "pour un nouveau client"})`,
  ]);
  await journaliser({ action: "dossier.duplique", libelle: d.activite, objet: { type: "dossier", id: nouveauId }, dossierId: nouveauId, details: d.details, activite: d.activite });
}
