import "server-only";
import { q, q1 } from "@/crm/lib/db";
import { nomClient } from "@/crm/lib/format";
import type { DossierCible, SourceDuplication } from "./types";

/*
 * Les lectures de la duplication : la recherche du dossier de destination
 * (devis, facture), ce que l'écran de création reprend d'un dossier
 * (?depuis=<id>), et ce que disent les bandeaux du nouvel objet.
 */

const court = (a?: string | null) => (a ? a.split(",").pop()!.trim() : "—");

/** Les dossiers où dupliquer : par référence, nom, société ou e-mail du client ; les plus récemment touchés d'abord. */
export async function chercherDossiers(texte: string, sauf: number | null): Promise<DossierCible[]> {
  const t = texte.trim().slice(0, 80);
  const p: unknown[] = [];
  const w: string[] = ["d.archive_le is null"];
  if (t) {
    p.push(`%${t}%`);
    w.push(`(d.ref ilike $1 or c.nom ilike $1 or c.prenom ilike $1 or c.societe ilike $1 or c.email ilike $1 or concat_ws(' ', c.prenom, c.nom) ilike $1)`);
  }
  if (sauf) {
    p.push(sauf);
    w.push(`d.id <> $${p.length}`);
  }
  const rows = await q(
    `select d.id, d.ref, d.statut, d.volume::float8 as volume, c.nom, c.prenom, c.societe,
        (select adresse from etapes_trajet where dossier_id = d.id and genre = 'depart' order by ordre, id limit 1) as depart,
        (select adresse from etapes_trajet where dossier_id = d.id and genre = 'arrivee' order by ordre desc, id desc limit 1) as arrivee
       from dossiers d join clients c on c.id = d.client_id
      where ${w.join(" and ")} order by d.maj_le desc, d.id desc limit 8`,
    p,
  );
  return rows.map((r) => ({
    id: r.id, ref: r.ref, statut: r.statut, volume: Number(r.volume) || 0, client: nomClient(r) || r.nom,
    trajet: `${court(r.depart)} → ${court(r.arrivee)}`,
  }));
}

/** Un dossier tel que « Dupliquer pour un nouveau client » le reprend (écran /dossiers/nouveau?depuis=<id>). */
export async function sourceDuplication(id: number): Promise<SourceDuplication | null> {
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  const d = await q1(
    `select d.id, d.ref, d.client_id, d.type_demenagement, d.volume::float8 as volume, d.vehicule, d.observations,
        c.type, c.civilite, c.prenom, c.nom, c.societe,
        (select row_to_json(e) from (select adresse, etage, ascenseur, acces, departement_om, port from etapes_trajet
           where dossier_id = d.id and genre = 'depart' order by ordre, id limit 1) e) as depart,
        (select row_to_json(e) from (select adresse, etage, ascenseur, acces, departement_om, port from etapes_trajet
           where dossier_id = d.id and genre = 'arrivee' order by ordre desc, id desc limit 1) e) as arrivee,
        (select count(*)::int from etapes_trajet where dossier_id = d.id and genre = 'autre') as intermediaires,
        exists (select 1 from etapes_trajet where dossier_id = d.id and genre = 'garde_meuble') as garde_meuble,
        (select count(*)::int from inventaire where dossier_id = d.id) as objets,
        (select count(*)::int from pieces where dossier_id = d.id) as pieces
       from dossiers d join clients c on c.id = d.client_id where d.id = $1`,
    [id],
  );
  if (!d) return null;
  return {
    id: d.id, ref: d.ref, clientId: d.client_id, client: nomClient(d) || d.nom,
    type: d.type, typeDemenagement: d.type_demenagement, volume: Number(d.volume) || 0, vehicule: !!d.vehicule, gardeMeuble: !!d.garde_meuble,
    observations: d.observations ?? null, depart: d.depart ?? null, arrivee: d.arrivee ?? null,
    intermediaires: d.intermediaires, objets: d.objets, pieces: d.pieces,
  };
}

/** Le bandeau d'un dossier qui vient d'être dupliqué : son origine, et ce que la duplication a repris (sa ligne au fil). */
export async function avisDossierDuplique(id: number, sourceId: number) {
  const [o, a] = await Promise.all([
    q1<{ id: number; ref: string; nom: string; prenom: string | null; societe: string | null }>(
      "select d.id, d.ref, c.nom, c.prenom, c.societe from dossiers d join clients c on c.id = d.client_id where d.id = $1",
      [sourceId],
    ),
    q1<{ libelle: string }>("select libelle from activite where dossier_id = $1 and libelle like 'Dossier dupliqué%' order by id limit 1", [id]),
  ]);
  if (!o || !a) return null;
  return { ref: o.ref, client: nomClient(o) || o.nom, lien: `/dossiers/${o.id}`, libelle: a.libelle };
}

/** Le bandeau d'un devis qui vient d'être dupliqué : le devis d'origine, son dossier, et les volumes. */
export async function avisDevisDuplique(devisId: number, sourceId: number) {
  const [o, n] = await Promise.all([
    q1<{ id: number; numero: string; dossier_id: number; ref: string; volume: number }>(
      "select v.id, v.numero, v.dossier_id, d.ref, d.volume::float8 as volume from devis v join dossiers d on d.id = v.dossier_id where v.id = $1",
      [sourceId],
    ),
    q1<{ dossier_id: number; volume: number }>("select v.dossier_id, d.volume::float8 as volume from devis v join dossiers d on d.id = v.dossier_id where v.id = $1", [devisId]),
  ]);
  if (!o || !n) return null;
  const memeDossier = o.dossier_id === n.dossier_id;
  return {
    numero: o.numero, ref: o.ref, memeDossier, lien: `/dossiers/${o.dossier_id}/devis/${o.id}`,
    volumeDiffere: !memeDossier && Math.abs((Number(o.volume) || 0) - (Number(n.volume) || 0)) > 0.05,
    volumes: [Number(o.volume) || 0, Number(n.volume) || 0] as [number, number],
  };
}

/** Le bandeau d'une fiche client dupliquée : la fiche d'origine. */
export async function avisClientDuplique(sourceId: number) {
  const c = await q1<{ id: number; nom: string; prenom: string | null; societe: string | null }>("select id, nom, prenom, societe from clients where id = $1", [sourceId]);
  return c ? { nom: c.societe || [c.prenom, c.nom].filter(Boolean).join(" ") || "Sans nom", lien: `/clients/${c.id}` } : null;
}
