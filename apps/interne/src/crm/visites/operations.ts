import "server-only";
import { z } from "zod";
import { transaction, type Db } from "@/crm/lib/db";
import { destinationsDuTrajet, type EtapeDestination } from "@/lib/visite/destinations";
import { PLAFONDS, PLAFONDS_ACCES, type Operation } from "@/lib/visite/regles";

/*
 * L'enregistrement continu de la saisie : la tablette envoie ses opérations
 * par lots (route /api/visites/<id>/operations), le serveur les applique dans
 * l'ordre, d'un seul tenant, puis recalcule le volume du dossier.
 *
 * Chaque opération désigne son objet par une clé tirée sur la tablette : la
 * rejouer ne fait rien de plus. Une pièce ou un objet d'un autre dossier
 * n'est jamais touché, même avec sa clé. Une visite signée refuse tout.
 *
 * L'inventaire est celui du dossier (crm.inventaire), le même que celui de la
 * fiche : la colonne texte `piece` suit le nom de la pièce. La destination
 * reste celle que le bureau a choisie (« Arrivée » pour un objet nouveau),
 * sauf quand la tablette rattache l'objet à une étape du trajet (retours de
 * Céline, 16/11/2026) : la colonne texte `destination` prend alors le libellé
 * de l'étape, calculé ici, jamais celui qu'envoie la tablette.
 *
 * Les opérations restées en file sur une tablette hors connexion arrivent
 * plus tard, dans l'ordre où elles ont été faites. Un champ qu'une ancienne
 * version de la tablette n'envoyait pas (absent du corps) ne change pas.
 */

const cle = z.uuid();
const texte = (max: number) => z.string().trim().max(max);
const facultatif = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .transform((v) => (v ? v : null));

/** Une étape du trajet choisie comme destination : son identifiant, ou rien. */
const destination = z.number().int().positive().nullable().optional();

const schema = z.discriminatedUnion("t", [
  z.object({ t: z.literal("piece"), cle, nom: texte(PLAFONDS.nom).min(1), ordre: z.number(), remarque: facultatif(PLAFONDS.remarque), destination }),
  z.object({ t: z.literal("piece-"), cle }),
  z.object({
    t: z.literal("objet"),
    cle,
    piece: cle,
    libelle: texte(PLAFONDS.libelle).min(1),
    quantite: z.number().int().min(1).max(PLAFONDS.quantite),
    volume: z.number().min(0).max(PLAFONDS.volume),
    demontage: z.boolean(),
    fragile: z.boolean(),
    note: facultatif(PLAFONDS.note),
    destination,
  }),
  z.object({ t: z.literal("objet-"), cle }),
  z.object({
    t: z.literal("visite"),
    remarques: facultatif(PLAFONDS.remarques).optional(),
    options: z.array(z.object({ libelle: texte(PLAFONDS.libelle).min(1), proposee: z.boolean() })).max(40).optional(),
    formule: z.enum(["premium", "standard", "economique"]).nullable().optional(),
  }),
  z.object({
    t: z.literal("etape"),
    id: z.number().int().positive(),
    etage: facultatif(20),
    ascenseur: z.boolean(),
    escalier: z.enum(["aucun", "droit", "colimacon", "etroit"]).nullable(),
    portage_m: z.number().int().min(0).max(1000).nullable(),
    stationnement: z.enum(["facile", "autorisation", "reserve_client"]).nullable(),
    poids_lourd: z.enum(["oui", "non", "ne_sait_pas"]).nullable(),
    monte_meuble: z.enum(["oui", "non", "a_evaluer"]).nullable(),
    monte_charge: z.boolean().optional(),
    transbordement: z.boolean().optional(),
    acces: facultatif(PLAFONDS.acces),
    ascenseur_taille: facultatif(PLAFONDS_ACCES.ascenseurTaille).optional(),
    escalier_precision: facultatif(PLAFONDS_ACCES.precision).optional(),
    stationnement_precision: facultatif(PLAFONDS_ACCES.precision).optional(),
  }),
]);

const lot = z.object({ ops: z.array(schema).min(1).max(200) });

/** Une erreur de la saisie, avec le statut HTTP à rendre. */
export class ErreurSaisie extends Error {
  constructor(
    readonly statut: number,
    message: string,
  ) {
    super(message);
  }
}

/** Lit le corps d'une requête : les opérations, validées, ou une erreur 400. */
export function lireOperations(corps: unknown): Operation[] {
  const r = lot.safeParse(corps);
  if (!r.success) throw new ErreurSaisie(400, "Opérations illisibles : rechargez la page.");
  return r.data.ops as Operation[];
}

/** Les destinations du dossier (étapes du trajet hors départ), lues une fois par lot, au premier besoin. */
type Destinations = () => Promise<Map<number, string>>;

function lecteurDestinations(db: Db, dossierId: number): Destinations {
  let lues: Promise<Map<number, string>> | null = null;
  return () =>
    (lues ??= db
      .query<EtapeDestination>("select id, genre, adresse, ville, code_postal from etapes_trajet where dossier_id = $1 order by ordre, id", [dossierId])
      .then((etapes) => new Map(destinationsDuTrajet(etapes).map((d) => [d.id, d.libelle]))));
}

async function appliquer(db: Db, dossierId: number, visiteId: number, op: Operation, photosRetirees: string[], destinations: Destinations) {
  switch (op.t) {
    case "piece": {
      // La destination de la pièce : une étape de CE dossier, sinon rien ; absente du corps, elle ne change pas.
      const etape = op.destination === undefined ? undefined : op.destination !== null && (await destinations()).has(op.destination) ? op.destination : null;
      const [p] = await db.query<{ id: number }>(
        `insert into pieces (cle, dossier_id, nom, ordre, remarque, etape_id) values ($1, $2, $3, $4, $5, $7)
         on conflict (cle) do update set nom = excluded.nom, ordre = excluded.ordre, remarque = excluded.remarque,
           etape_id = case when $6::boolean then excluded.etape_id else pieces.etape_id end
           where pieces.dossier_id = excluded.dossier_id
         returning id`,
        [op.cle, dossierId, op.nom, op.ordre, op.remarque, etape !== undefined, etape ?? null],
      );
      if (p) await db.query("update inventaire set piece = $2 where piece_id = $1 and piece is distinct from $2", [p.id, op.nom]);
      return;
    }
    case "piece-": {
      // Les photos de la pièce, prises pendant cette visite, partent avec elle.
      const photos = await db.query<{ chemin: string; chemin_vignette: string | null }>(
        "delete from visite_photos where visite_id = $1 and piece_cle = $2 returning chemin, chemin_vignette",
        [visiteId, op.cle],
      );
      for (const ph of photos) photosRetirees.push(ph.chemin, ...(ph.chemin_vignette ? [ph.chemin_vignette] : []));
      // Ses objets aussi (inventaire.piece_id : on delete cascade).
      await db.query("delete from pieces where cle = $1 and dossier_id = $2", [op.cle, dossierId]);
      return;
    }
    case "objet": {
      const [p] = await db.query<{ id: number; nom: string }>("select id, nom from pieces where cle = $1 and dossier_id = $2", [op.piece, dossierId]);
      if (!p) return;
      // La destination : une étape de CE dossier, avec son libellé ; sans étape, l'objet garde la sienne.
      const libelle = op.destination != null ? (await destinations()).get(op.destination) : undefined;
      await db.query(
        `insert into inventaire (cle, dossier_id, piece_id, piece, libelle, quantite, volume, destination, demontage, fragile, note, ordre, etape_id)
         values ($1, $2, $3, $4, $5, $6, $7, coalesce($12, 'Arrivée'), $8, $9, $10, extract(epoch from clock_timestamp()), $11)
         on conflict (cle) do update set piece_id = excluded.piece_id, piece = excluded.piece, libelle = excluded.libelle,
           quantite = excluded.quantite, volume = excluded.volume, demontage = excluded.demontage, fragile = excluded.fragile, note = excluded.note,
           etape_id = coalesce($11, inventaire.etape_id), destination = coalesce($12, inventaire.destination)
           where inventaire.dossier_id = excluded.dossier_id`,
        [op.cle, dossierId, p.id, p.nom, op.libelle, op.quantite, op.volume, op.demontage, op.fragile, op.note, libelle ? op.destination : null, libelle ?? null],
      );
      return;
    }
    case "objet-":
      await db.query("delete from inventaire where cle = $1 and dossier_id = $2", [op.cle, dossierId]);
      return;
    case "visite": {
      const champs: string[] = [];
      const valeurs: unknown[] = [visiteId];
      if (op.remarques !== undefined) champs.push(`remarques = $${valeurs.push(op.remarques)}`);
      if (op.options !== undefined) champs.push(`options = $${valeurs.push(JSON.stringify(op.options))}::jsonb`);
      if (op.formule !== undefined) champs.push(`formule = $${valeurs.push(op.formule)}`);
      if (champs.length) await db.query(`update visites set ${champs.join(", ")} where id = $1`, valeurs);
      return;
    }
    case "etape":
      await db.query(
        `update etapes_trajet set etage = $3, ascenseur = $4, escalier = $5, portage_m = $6, stationnement = $7, poids_lourd = $8, monte_meuble = $9, acces = $10,
                monte_charge = coalesce($11, monte_charge), transbordement = coalesce($12, transbordement),
                ascenseur_taille = case when $13::boolean then $14 else ascenseur_taille end,
                escalier_precision = case when $15::boolean then $16 else escalier_precision end,
                stationnement_precision = case when $17::boolean then $18 else stationnement_precision end
          where id = $1 and dossier_id = $2`,
        [
          op.id, dossierId, op.etage, op.ascenseur, op.escalier, op.portage_m, op.stationnement, op.poids_lourd, op.monte_meuble, op.acces, op.monte_charge ?? null, op.transbordement ?? null,
          op.ascenseur_taille !== undefined, op.ascenseur_taille ?? null,
          op.escalier_precision !== undefined, op.escalier_precision ?? null,
          op.stationnement_precision !== undefined, op.stationnement_precision ?? null,
        ],
      );
      return;
  }
}

export type IssueOperations = { dossierId: number; volume: number; volumeAvant: number; majLe: string; photosRetirees: string[] };

/** Applique un lot d'opérations à une visite en cours. Tout passe, ou rien. */
export async function appliquerOperations(visiteId: number, ops: Operation[]): Promise<IssueOperations> {
  return transaction(async (db) => {
    const [v] = await db.query<{ dossier_id: number; statut: string; volume: number }>(
      "select v.dossier_id, v.statut, d.volume::float8 as volume from visites v join dossiers d on d.id = v.dossier_id where v.id = $1 for update of v",
      [visiteId],
    );
    if (!v) throw new ErreurSaisie(404, "Visite introuvable.");
    if (v.statut === "signee") throw new ErreurSaisie(409, "Le compte-rendu de cette visite est signé : elle ne se modifie plus.");
    const photosRetirees: string[] = [];
    const destinations = lecteurDestinations(db, v.dossier_id);
    for (const op of ops) await appliquer(db, v.dossier_id, visiteId, op, photosRetirees, destinations);
    const [d] = await db.query<{ volume: number }>(
      `update dossiers set volume = coalesce((select sum(quantite * volume) from inventaire where dossier_id = $1), 0), maj_le = now()
        where id = $1 returning volume::float8 as volume`,
      [v.dossier_id],
    );
    const [m] = await db.query<{ maj_le: Date }>("update visites set maj_le = now() where id = $1 returning maj_le", [visiteId]);
    return { dossierId: v.dossier_id, volume: d.volume, volumeAvant: v.volume, majLe: new Date(m.maj_le).toISOString(), photosRetirees };
  });
}
