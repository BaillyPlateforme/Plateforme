/*
 * Les comptes de test, en RECETTE seulement (la batterie n'a aucune clé de
 * service de production, et n'en veut pas).
 *
 * Un compte de chaque sorte, tous en batterie.…@example.com, avec un mot de
 * passe tiré au hasard à chaque passage (gardé dans tests/.etat, exclu de Git) :
 *   equipe     membre de l'équipe (team_members, admin) — entre dans le CRM ;
 *   intrus     compte SANS rôle mais hors de l'équipe — doit être refusé partout ;
 *   inconnu    rôle « pirate » — un rôle inconnu n'ouvre rien ;
 *   rh         RH d'un grand compte (espace « carrefour ») ;
 *   client     rôle client, avec mot de passe — seulement pour vérifier les
 *              cloisons (le vrai client entre par un lien, voir parcours/) ;
 *   terrain    déménageur (crm.agents_terrain), identifiant « batterie.terrain ».
 *
 * Le nettoyage efface tout ce qui porte ces adresses — comptes, demandes,
 * envois journalisés, fiches du CRM, clients de l'espace client — et ne
 * touche à rien d'autre. Seul le compte « equipe » reste, désactivé et avec un
 * mot de passe que personne ne connaît : l'historique du CRM (crm.activite)
 * peut le citer, et l'effacer casserait ces lignes.
 */
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { ETAT, PREFIXE, RACINE, emailDeTest, projet } from "./config.mjs";

const exiger = createRequire(path.join(RACINE, "package.json"));
const { createClient } = exiger("@supabase/supabase-js");
const pg = exiger("pg");

export const DOMAINE_TERRAIN = "terrain.bailly.invalid";
export const IDENTIFIANT_TERRAIN = "batterie.terrain";

export const SORTES = {
  equipe: { email: emailDeTest("equipe"), app_metadata: {}, nom: "Batterie de tests" },
  intrus: { email: emailDeTest("intrus"), app_metadata: {} },
  inconnu: { email: emailDeTest("role-inconnu"), app_metadata: { role: "pirate" } },
  rh: { email: emailDeTest("rh"), app_metadata: { role: "rh", espace_id: "carrefour" } },
  client: { email: emailDeTest("client"), app_metadata: { role: "client" } },
  terrain: { email: `${IDENTIFIANT_TERRAIN}@${DOMAINE_TERRAIN}`, app_metadata: { role: "terrain" } },
};

const FICHIER = path.join(ETAT, "comptes.json");

export const service = () => {
  const p = projet("recette");
  if (!p.url || !p.service) throw new Error("Accès à la recette introuvables (apps/interne/.env.local).");
  return createClient(p.url, p.service, { auth: { persistSession: false, autoRefreshToken: false } });
};

export async function baseRecette() {
  const c = new pg.Client({ connectionString: projet("recette").db, ssl: { rejectUnauthorized: false } });
  await c.connect();
  return c;
}

/** Tous les utilisateurs Auth de la batterie (pagination de l'API d'administration). */
async function utilisateursDeTest(sb) {
  const trouves = [];
  for (let page = 1; page < 50; page++) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`Lecture des comptes : ${error.message}`);
    for (const u of data.users) if ((u.email ?? "").toLowerCase().startsWith(PREFIXE)) trouves.push(u);
    if (data.users.length < 1000) break;
  }
  return trouves;
}

/** Crée (ou remet à neuf) les six comptes, et écrit leurs mots de passe dans tests/.etat. */
export async function preparerComptes() {
  const sb = service();
  const existants = new Map((await utilisateursDeTest(sb)).map((u) => [u.email.toLowerCase(), u]));
  const resultat = {};
  for (const [sorte, def] of Object.entries(SORTES)) {
    const motDePasse = `Bt-${randomBytes(18).toString("base64url")}9!`;
    const deja = existants.get(def.email);
    let id;
    if (deja) {
      const { error } = await sb.auth.admin.updateUserById(deja.id, { password: motDePasse, app_metadata: def.app_metadata, ban_duration: "none", email_confirm: true });
      if (error) throw new Error(`Compte ${sorte} : ${error.message}`);
      id = deja.id;
    } else {
      const { data, error } = await sb.auth.admin.createUser({ email: def.email, password: motDePasse, email_confirm: true, app_metadata: def.app_metadata });
      if (error) throw new Error(`Compte ${sorte} : ${error.message}`);
      id = data.user.id;
    }
    resultat[sorte] = { id, email: def.email, motDePasse };
  }

  const db = await baseRecette();
  try {
    await db.query(
      `insert into public.team_members(id, email, nom, role, actif) values ($1, $2, $3, 'admin', true)
       on conflict (email) do update set id = excluded.id, nom = excluded.nom, role = 'admin', actif = true`,
      [resultat.equipe.id, SORTES.equipe.email, SORTES.equipe.nom],
    );
    await db.query(
      `insert into crm.agents_terrain(auth_id, identifiant, email, prenom, nom, equipe, actif, mdp_provisoire, demo, cree_par)
       values ($1, $2, $3, 'Batterie', 'Terrain', 'Équipe de test', true, false, true, 'batterie')
       on conflict (identifiant) do update set auth_id = excluded.auth_id, actif = true, mdp_provisoire = false, desactive_le = null`,
      [resultat.terrain.id, IDENTIFIANT_TERRAIN, SORTES.terrain.email],
    );
  } finally {
    await db.end();
  }

  fs.mkdirSync(ETAT, { recursive: true });
  fs.writeFileSync(FICHIER, JSON.stringify(resultat, null, 2), { mode: 0o600 });
  return resultat;
}

export function lireComptes() {
  if (!fs.existsSync(FICHIER)) throw new Error("Comptes de test absents : la préparation n'a pas tourné.");
  return JSON.parse(fs.readFileSync(FICHIER, "utf8"));
}

const MOTIF = `${PREFIXE.replace(".", "\\.")}%`;

/**
 * Efface tout ce que la batterie a laissé en recette. Rend le décompte de ce
 * qui a été retiré, et la liste de ce qui resterait (doit être vide).
 */
export async function nettoyer() {
  const sb = service();
  const db = await baseRecette();
  const retires = {};
  const compter = (cle, n) => {
    if (n) retires[cle] = (retires[cle] ?? 0) + n;
  };
  const motif = `${PREFIXE}%@example.com`;
  try {
    await db.query("begin");
    // Les demandes et ce qui en dépend (événements, objets, photos : en cascade ; devis et e-mails reçus : à la main).
    const demandes = (await db.query("select id from public.requests where lower(client_email) like $1", [motif])).rows.map((r) => r.id);
    if (demandes.length) {
      compter("devis", (await db.query("delete from public.devis where request_id = any($1)", [demandes])).rowCount);
      compter("emails_recus", (await db.query("delete from public.emails_recus where request_id = any($1)", [demandes])).rowCount);
      compter("requests", (await db.query("delete from public.requests where id = any($1)", [demandes])).rowCount);
    }
    compter("emails_recus", (await db.query("delete from public.emails_recus where lower(coalesce(expediteur, '')) like $1 or lower(coalesce(client_email, '')) like $1", [motif])).rowCount);
    compter("devis", (await db.query("delete from public.devis where lower(coalesce(client_email, '')) like $1", [motif])).rowCount);
    compter("emails", (await db.query("delete from public.emails where lower(coalesce(destinataire, '')) like $1 or lower(coalesce(client_email, '')) like $1", [motif])).rowCount);
    compter("client_profiles", (await db.query("delete from public.client_profiles where lower(email) like $1", [motif])).rowCount);
    // Les envois journalisés vers une adresse de test, et leur suivi.
    const envois = (await db.query("select id from public.envois where lower(destinataire) like $1", [motif])).rows.map((r) => r.id);
    if (envois.length) {
      for (const t of ["envois_evenements", "envois_liens"]) {
        const col = (await db.query("select column_name from information_schema.columns where table_schema='public' and table_name=$1 and column_name in ('envoi_id','envoi')", [t])).rows[0]?.column_name;
        if (col) compter(t, (await db.query(`delete from public.${t} where ${col} = any($1)`, [envois])).rowCount);
      }
      compter("envois", (await db.query("delete from public.envois where id = any($1)", [envois])).rowCount);
    }
    // Le CRM : clients de test (dossiers, devis, factures… en cascade), puis l'agent terrain.
    compter("crm.clients", (await db.query("delete from crm.clients where lower(coalesce(email, '')) like $1", [motif])).rowCount);
    compter("crm.agents_terrain", (await db.query("delete from crm.agents_terrain where identifiant like $1", [MOTIF])).rowCount);
    // L'espace client : clients de test (dossiers, liens, sessions… en cascade).
    compter("ec_clients", (await db.query("delete from public.ec_clients where lower(email) like $1", [motif])).rowCount);
    // L'équipe : le compte de test reste, désactivé (voir plus haut).
    compter("team_members (désactivés)", (await db.query("update public.team_members set actif = false where lower(email) like $1 and actif", [motif])).rowCount);
    await db.query("commit");
  } catch (e) {
    await db.query("rollback").catch(() => {});
    throw e;
  } finally {
    await db.end();
  }

  // Les comptes Auth : tous effacés, sauf l'équipe, bannie et au mot de passe inconnu.
  for (const u of await utilisateursDeTest(sb)) {
    if (u.email.toLowerCase() === SORTES.equipe.email) {
      await sb.auth.admin.updateUserById(u.id, { password: randomBytes(32).toString("base64url"), ban_duration: "876000h" });
      compter("auth (équipe bannie)", 1);
    } else {
      const { error } = await sb.auth.admin.deleteUser(u.id);
      if (!error) compter("auth.users", 1);
    }
  }
  if (fs.existsSync(FICHIER)) fs.rmSync(FICHIER);
  return { retires, restes: await restes() };
}

/** Ce qui porte encore une adresse de test en recette (hors compte équipe désactivé) : doit être vide. */
export async function restes() {
  const db = await baseRecette();
  const motif = `${PREFIXE}%@example.com`;
  try {
    const q = async (sql) => Number((await db.query(sql, [motif])).rows[0].n);
    const r = {
      requests: await q("select count(*) n from public.requests where lower(client_email) like $1"),
      envois: await q("select count(*) n from public.envois where lower(destinataire) like $1"),
      "crm.clients": await q("select count(*) n from crm.clients where lower(coalesce(email,'')) like $1"),
      ec_clients: await q("select count(*) n from public.ec_clients where lower(email) like $1"),
      "team_members actifs": await q("select count(*) n from public.team_members where lower(email) like $1 and actif"),
      "auth.users (hors équipe)": await q(`select count(*) n from auth.users where lower(email) like $1 and lower(email) <> '${SORTES.equipe.email}'`),
      "auth.users terrain": Number((await db.query(`select count(*) n from auth.users where lower(email) = $1`, [SORTES.terrain.email])).rows[0].n),
      client_profiles: await q("select count(*) n from public.client_profiles where lower(email) like $1"),
    };
    return Object.fromEntries(Object.entries(r).filter(([, n]) => n > 0));
  } finally {
    await db.end();
  }
}
