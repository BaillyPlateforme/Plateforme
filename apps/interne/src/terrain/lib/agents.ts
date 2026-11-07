import "server-only";
import { randomInt } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/server";
import { q, q1 } from "@/crm/lib/db";
import { DOMAINE_TERRAIN, FORMAT_IDENTIFIANT, identifiantSaisi } from "../regles";

/*
 * Les comptes des déménageurs : un par personne, intérimaires compris.
 *
 * Chacun est un compte Supabase Auth (app_metadata.role = "terrain", que seul
 * le serveur peut écrire) et une ligne crm.agents_terrain : son nom, son
 * équipe, son état. Le compte se connecte avec un identifiant court
 * (« karim.d ») ; l'adresse du compte est prise sur un domaine réservé qui ne
 * reçoit aucun courrier (voir regles.ts).
 *
 * Le mot de passe provisoire est tiré au hasard, rendu une seule fois à
 * l'équipe qui crée le compte (ou le réinitialise) et jamais enregistré en
 * clair : Supabase n'en garde que l'empreinte. Le déménageur peut ensuite
 * choisir le sien.
 *
 * Désactiver un compte le bloque chez Supabase (plus de connexion, plus de
 * renouvellement de session) et dans la base (chaque page de l'outil relit
 * l'état : l'effet est immédiat). Rien n'est supprimé : les photos envoyées
 * gardent leur auteur. Réactiver rouvre le même compte.
 */

export type AgentListe = {
  id: number;
  identifiant: string;
  prenom: string;
  nom: string | null;
  equipe: string | null;
  interimaire: boolean;
  actif: boolean;
  mdpProvisoire: boolean;
  demo: boolean;
  creePar: string | null;
  creeLe: string;
  desactiveLe: string | null;
  photos7j: number;
  photosTotal: number;
  dernierePhoto: string | null;
  derniereConnexion: string | null;
};

const ISO = (col: string) => `to_char(${col} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`;

export async function listerAgents(): Promise<AgentListe[]> {
  const rows = await q<AgentListe & { authId: string }>(
    `select a.id, a.auth_id as "authId", a.identifiant, a.prenom, a.nom, a.equipe, a.interimaire, a.actif,
       a.mdp_provisoire as "mdpProvisoire", a.demo, a.cree_par as "creePar", ${ISO("a.cree_le")} as "creeLe",
       ${ISO("a.desactive_le")} as "desactiveLe",
       count(p.id) filter (where p.prise_le > now() - interval '7 days')::int as "photos7j",
       count(p.id)::int as "photosTotal", ${ISO("max(p.prise_le)")} as "dernierePhoto"
     from agents_terrain a left join photos_chantier p on p.agent_id = a.id
     group by a.id order by a.actif desc, a.prenom, a.nom`,
  );
  // La dernière connexion est chez Supabase Auth : une seule lecture de la liste des comptes.
  const connexions = new Map<string, string | null>();
  try {
    const { data } = await createServiceClient().auth.admin.listUsers({ perPage: 1000 });
    for (const u of data?.users ?? []) connexions.set(u.id, u.last_sign_in_at ?? null);
  } catch {
    // Supabase injoignable : la colonne reste vide, la liste s'affiche quand même.
  }
  return rows.map(({ authId, ...a }) => ({ ...a, derniereConnexion: connexions.get(authId) ?? null }));
}

/** Les équipes connues, telles qu'au planning (« Équipe 1 ») : pour proposer, sans imposer. */
export async function equipesConnues(): Promise<string[]> {
  const rows = await q<{ e: string }>(
    `select distinct e from (
       select nullif(btrim(split_part(equipe, ' · ', 1)), '') as e from lettres_voiture
       union select nullif(btrim(split_part(equipe, ' · ', 1)), '') from operations
       union select nullif(btrim(equipe), '') from agents_terrain
     ) t where e is not null order by e`,
  );
  return rows.map((r) => r.e);
}

/** Douze caractères faciles à lire et à taper sur un téléphone : ni i, l, o, 0 ni 1. */
export function motDePasseProvisoire() {
  const A = "abcdefghjkmnpqrstuvwxyz23456789";
  const bloc = () => Array.from({ length: 4 }, () => A[randomInt(A.length)]).join("");
  return `${bloc()}-${bloc()}-${bloc()}`;
}

const propre = (s: unknown, max = 80) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, max);

export type NouvelAgent = { prenom: string; nom: string; equipe: string; interimaire: boolean; identifiant: string };

export async function creerAgent(saisie: NouvelAgent, creePar: string) {
  const prenom = propre(saisie.prenom, 60);
  const nom = propre(saisie.nom, 60) || null;
  const equipe = propre(saisie.equipe, 60) || null;
  const identifiant = identifiantSaisi(saisie.identifiant);
  if (!prenom) throw new Error("Le prénom est nécessaire.");
  if (!FORMAT_IDENTIFIANT.test(identifiant))
    throw new Error("L'identifiant : 3 à 40 caractères, une lettre d'abord, puis des lettres sans accent, des chiffres, des points ou des tirets.");
  if (await q1("select 1 from agents_terrain where identifiant = $1", [identifiant])) throw new Error(`L'identifiant « ${identifiant} » est déjà pris.`);

  const email = `${identifiant}@${DOMAINE_TERRAIN}`;
  const motDePasse = motDePasseProvisoire();
  const admin = createServiceClient().auth.admin;
  const { data, error } = await admin.createUser({
    email,
    password: motDePasse,
    email_confirm: true,
    app_metadata: { role: "terrain" },
    user_metadata: { nom: [prenom, nom].filter(Boolean).join(" ") },
  });
  if (error || !data.user) {
    if (/already|exists|registered/i.test(error?.message ?? "")) throw new Error(`L'identifiant « ${identifiant} » est déjà pris.`);
    throw new Error(`Le compte n'a pas pu être créé : ${error?.message ?? "réponse vide"}.`);
  }
  try {
    await q(
      `insert into agents_terrain (auth_id, identifiant, email, prenom, nom, equipe, interimaire, cree_par)
       values ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [data.user.id, identifiant, email, prenom, nom, equipe, !!saisie.interimaire, creePar],
    );
  } catch (e) {
    // Pas de compte à moitié créé : sans sa ligne, le compte Auth n'ouvrirait rien, autant le retirer.
    await admin.deleteUser(data.user.id).catch(() => undefined);
    throw e;
  }
  return { identifiant, motDePasse };
}

async function authDe(id: number) {
  const r = await q1<{ authId: string; identifiant: string }>(`select auth_id as "authId", identifiant from agents_terrain where id = $1`, [id]);
  if (!r) throw new Error("Ce compte n'existe plus.");
  return r;
}

/** Cent ans : la durée que Supabase sait écrire pour « jusqu'à nouvel ordre ». */
const BLOCAGE = "876000h";

export async function desactiverAgent(id: number) {
  const { authId } = await authDe(id);
  const admin = createServiceClient().auth.admin;
  const { error } = await admin.updateUserById(authId, { ban_duration: BLOCAGE });
  if (error) throw new Error(`Le compte n'a pas pu être bloqué : ${error.message}.`);
  try {
    await q("update agents_terrain set actif = false, desactive_le = now() where id = $1", [id]);
  } catch (e) {
    await admin.updateUserById(authId, { ban_duration: "none" }).catch(() => undefined);
    throw e;
  }
}

export async function reactiverAgent(id: number) {
  const { authId } = await authDe(id);
  const { error } = await createServiceClient().auth.admin.updateUserById(authId, { ban_duration: "none" });
  if (error) throw new Error(`Le compte n'a pas pu être débloqué : ${error.message}.`);
  await q("update agents_terrain set actif = true, desactive_le = null where id = $1", [id]);
}

export async function reinitialiserMotDePasse(id: number) {
  const { authId, identifiant } = await authDe(id);
  const motDePasse = motDePasseProvisoire();
  const { error } = await createServiceClient().auth.admin.updateUserById(authId, { password: motDePasse });
  if (error) throw new Error(`Le mot de passe n'a pas pu être changé : ${error.message}.`);
  await q("update agents_terrain set mdp_provisoire = true where id = $1", [id]);
  return { identifiant, motDePasse };
}

export async function changerEquipe(id: number, equipe: string, interimaire: boolean) {
  await authDe(id);
  await q("update agents_terrain set equipe = $2, interimaire = $3 where id = $1", [id, propre(equipe, 60) || null, interimaire]);
}

/** Le déménageur choisit son mot de passe : il n'est plus provisoire. */
export async function choisirMotDePasse(agentId: number, authId: string, motDePasse: string) {
  if (motDePasse.length < 8) throw new Error("Au moins 8 caractères.");
  if (motDePasse.length > 72) throw new Error("72 caractères au plus.");
  const { error } = await createServiceClient().auth.admin.updateUserById(authId, { password: motDePasse });
  if (error) throw new Error(/weak|short|pwned/i.test(error.message) ? "Ce mot de passe est trop simple : choisissez-en un autre." : `Le mot de passe n'a pas pu être changé : ${error.message}.`);
  await q("update agents_terrain set mdp_provisoire = false where id = $1", [agentId]);
}

/**
 * L'adresse du compte qui porte cet identifiant, pour la connexion. Un
 * identifiant inconnu rend l'adresse qu'il aurait : la réponse ne dit pas
 * s'il existe. Une adresse tapée telle quelle (avec @) est rendue telle quelle.
 */
export async function adresseDe(saisie: string) {
  const id = identifiantSaisi(saisie);
  if (id.includes("@")) return id;
  const r = await q1<{ email: string }>("select email from agents_terrain where identifiant = $1", [id]);
  return r?.email ?? `${id}@${DOMAINE_TERRAIN}`;
}
