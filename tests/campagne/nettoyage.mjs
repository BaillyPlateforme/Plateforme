/*
 * Le nettoyage de la campagne, en recette.
 *
 * `nettoyer()` (outils/comptes.mjs) efface tout ce qui porte une adresse
 * batterie.…@example.com. Une demande du site laisse en plus, hors de cette
 * adresse :
 *   - les envois journalisés vers le téléphone du client (SMS « à
 *     compléter ») et vers l'équipe (alerte « nouvelle demande »), tous
 *     rattachés à la demande par leur référence ;
 *   - le journal des alertes de l'équipe (crm.alertes_evenements) ;
 *   - les photos déposées pour l'analyse (stockage, dossier staging/).
 * Ils sont effacés ici, d'après les demandes de test, avant `nettoyer()`.
 */
import path from "node:path";
import { RACINE, lireEnv } from "../outils/config.mjs";
import { baseRecette, nettoyer, restes, service } from "../outils/comptes.mjs";

const MOTIF = "batterie.%@example.com";
const seau = () => lireEnv(path.join(RACINE, "apps/externe/.env.local")).SUPABASE_STORAGE_BUCKET || "request-photos";

/** Les demandes de test, leurs photos déposées, et ce qui y renvoie hors de l'adresse de test. */
async function inventaire(db) {
  const ids = (await db.query("select id::text from public.requests where lower(client_email) like $1", [MOTIF])).rows.map((r) => r.id);
  const photos = ids.length
    ? (await db.query("select storage_path from public.request_photos where request_id = any($1::uuid[]) and storage_path like 'staging/%'", [ids])).rows.map((r) => r.storage_path)
    : [];
  const envois = ids.length ? (await db.query("select id from public.envois where reference = any($1::text[])", [ids])).rows.map((r) => r.id) : [];
  const alertes = (await db.query("select to_regclass('crm.alertes_evenements') is not null as ok")).rows[0].ok;
  const journal = alertes && ids.length ? Number((await db.query("select count(*) n from crm.alertes_evenements where reference = any($1::text[])", [ids])).rows[0].n) : 0;
  return { ids, photos, envois, journal, alertes };
}

/** Les références de devis de la campagne, en double s'il y en a : à relever AVANT d'effacer. */
export async function bilanDevis() {
  const db = await baseRecette();
  try {
    const lignes = (
      await db.query(
        `select d.reference, d.status, d.request_id::text as demande from public.devis d
         join public.requests r on r.id = d.request_id where lower(r.client_email) like $1 order by d.reference`,
        [MOTIF],
      )
    ).rows;
    const vues = new Map();
    for (const l of lignes) vues.set(l.reference, [...(vues.get(l.reference) ?? []), l.demande]);
    const doublons = [...vues].filter(([, d]) => d.length > 1).map(([reference, demandes]) => ({ reference, demandes }));
    const malFormees = lignes.filter((l) => !/^DEV-\d{4}-\d{4,}$/.test(l.reference ?? "")).map((l) => l.reference);
    return { total: lignes.length, doublons, malFormees };
  } finally {
    await db.end();
  }
}

export async function nettoyerCampagne() {
  const db = await baseRecette();
  const retires = {};
  let inv;
  try {
    inv = await inventaire(db);
    await db.query("begin");
    if (inv.envois.length) {
      for (const t of ["envois_evenements", "envois_liens"]) {
        const col = (await db.query("select column_name from information_schema.columns where table_schema='public' and table_name=$1 and column_name in ('envoi_id','envoi')", [t])).rows[0]?.column_name;
        if (col) retires[t] = (await db.query(`delete from public.${t} where ${col} = any($1)`, [inv.envois])).rowCount;
      }
      retires["envois (par référence)"] = (await db.query("delete from public.envois where id = any($1)", [inv.envois])).rowCount;
    }
    if (inv.journal) retires["crm.alertes_evenements"] = (await db.query("delete from crm.alertes_evenements where reference = any($1::text[])", [inv.ids])).rowCount;
    await db.query("commit");
  } catch (e) {
    await db.query("rollback").catch(() => {});
    throw e;
  } finally {
    await db.end();
  }
  // Les photos déposées pour l'analyse, dans le stockage.
  if (inv.photos.length) {
    const { error } = await service().storage.from(seau()).remove(inv.photos);
    if (error) throw new Error(`Photos de test non effacées : ${error.message}`);
    retires["photos (stockage)"] = inv.photos.length;
  }
  const { retires: base, restes: r } = await nettoyer();
  // Ce qui resterait des photos : relu dans le stockage.
  const dossiers = [...new Set(inv.photos.map((p) => p.split("/").slice(0, 2).join("/")))];
  const photosRestantes = [];
  for (const d of dossiers) {
    const { data } = await service().storage.from(seau()).list(d);
    for (const f of data ?? []) photosRestantes.push(`${d}/${f.name}`);
  }
  const reste = { ...r, ...(photosRestantes.length ? { "photos (stockage)": photosRestantes.length } : {}) };
  return { retires: { ...retires, ...base }, restes: reste };
}

export { restes };
