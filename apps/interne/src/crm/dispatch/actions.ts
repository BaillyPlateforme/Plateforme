"use server";
import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { currentUser, type User } from "@/crm/lib/auth";
import { q, transaction, type Db } from "@/crm/lib/db";
import { semerDemo } from "./demo";
import { idValide, lignesEtColonnes } from "./donnees";
import { lireFichier, TAILLE_MAX, type Feuille } from "./fichiers";
import { proposerParIa } from "./ia";
import { arrondi, capacitePour, estVerrouillee, jauge, lireVolume, m3 } from "./outils";
import { finaliser } from "./proposition";
import { regrouperParRegles, type Contexte } from "./regroupement";
import { cleDoublon, estVide, verifierLigne } from "./saisie";
import { GENRES, type ContenuProposition, type LigneSaisie, type Parametres, type Proposition, type Resultat } from "./types";

/*
 * Les actions du dispatch des conteneurs. Chacune vérifie la session (une
 * action serveur peut être appelée depuis n'importe quelle page), revérifie
 * ce que le navigateur envoie, refuse de toucher une colonne verrouillée, et
 * inscrit ce qu'elle fait dans l'historique du plan.
 *
 * Elles rendent { ok, erreur } plutôt que de lever : le dispatcheur lit
 * pourquoi un déplacement est refusé, au lieu d'une page d'erreur.
 */

/** Un refus expliqué au dispatcheur (colonne verrouillée, champ manquant…). */
class Refus extends Error {}

async function sur<T>(fn: (u: User) => Promise<T>): Promise<Resultat<T>> {
  try {
    const u = await currentUser();
    return { ok: true, donnees: await fn(u) };
  } catch (e) {
    unstable_rethrow(e);
    if (e instanceof Refus) return { ok: false, erreur: e.message };
    console.error("Dispatch :", e);
    return { ok: false, erreur: "L'opération n'a pas pu être enregistrée. Réessayez, ou rechargez la page." };
  }
}

const rafraichir = (planId?: number) => {
  revalidatePath("/conteneurs/dispatch");
  if (planId) revalidatePath(`/conteneurs/dispatch/${planId}`);
};

async function journal(
  db: Db,
  planId: number,
  u: User,
  action: string,
  libelle: string,
  lien: { ligne?: number | null; colonne?: number | null; details?: unknown } = {},
) {
  await db.query("insert into dispatch_historique(plan_id, ligne_id, colonne_id, action, libelle, details, utilisateur_id) values($1,$2,$3,$4,$5,$6,$7)", [
    planId,
    lien.ligne ?? null,
    lien.colonne ?? null,
    action,
    libelle,
    lien.details == null ? null : JSON.stringify(lien.details),
    u.id,
  ]);
  await db.query("update dispatch_plans set maj_le = now() where id = $1", [planId]);
}

const SURQ: Db = { query: (sql, params) => q(sql, params) };

async function exigerPlan(db: Db, planId: number) {
  if (!idValide(planId)) throw new Refus("Plan introuvable.");
  const p = (await db.query("select id, nom, demo, capacite_20::float8 as c20, capacite_40::float8 as c40 from dispatch_plans where id = $1", [planId]))[0];
  if (!p) throw new Refus("Ce plan n'existe plus.");
  return p as { id: number; nom: string; demo: boolean; c20: number; c40: number };
}

/** La colonne, verrouillée sur la ligne (for update) dans une transaction ; refusée si elle est validée. */
async function colonneOuverte(db: Db, planId: number, colonneId: number) {
  const c = (await db.query("select id, libelle, verrouillee_le from dispatch_colonnes where id = $1 and plan_id = $2 for update", [colonneId, planId]))[0];
  if (!c) throw new Refus("Cette colonne n'existe plus : rechargez la page.");
  if (c.verrouillee_le) throw new Refus(`« ${c.libelle} » est verrouillée : déverrouillez-la pour la modifier.`);
  return c as { id: number; libelle: string };
}

const texte = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((s) => (s === "" ? null : s));
const nombreOuNul = z.union([z.number(), z.string(), z.null()]).transform((v) => (v == null || v === "" ? null : lireVolume(v)));
const dateOuNulle = z
  .string()
  .trim()
  .transform((s) => (/^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null))
  .nullable();

/* ───────────── Plans ───────────── */

const PLAN = z.object({
  nom: z.string().trim().min(1, "Donnez un nom au plan.").max(120),
  sens: z.enum(["export", "import"]).catch("export"),
  port: texte(80),
  date_reference: dateOuNulle,
  notes: texte(2000),
  capacite_20: nombreOuNul,
  capacite_40: nombreOuNul,
});

const lirePlan = (f: FormData) =>
  PLAN.safeParse({
    nom: String(f.get("nom") ?? ""),
    sens: String(f.get("sens") ?? "export"),
    port: String(f.get("port") ?? ""),
    date_reference: String(f.get("date_reference") ?? ""),
    notes: String(f.get("notes") ?? ""),
    capacite_20: String(f.get("capacite_20") ?? ""),
    capacite_40: String(f.get("capacite_40") ?? ""),
  });

const capaciteValide = (c: number | null) => c != null && c > 0 && c < 1000;

export async function creerPlan(_etat: Resultat | null, f: FormData): Promise<Resultat> {
  const lu = lirePlan(f);
  if (!lu.success) return { ok: false, erreur: lu.error.issues[0]?.message ?? "Formulaire incomplet." };
  let id = 0;
  const r = await sur(async (u) => {
    const v = lu.data;
    id = await transaction(async (db) => {
      const [{ id }] = await db.query<{ id: number }>(
        `insert into dispatch_plans(nom, sens, port, date_reference, notes, capacite_20, capacite_40, cree_par) values($1,$2,$3,$4,$5,$6,$7,$8) returning id`,
        [v.nom, v.sens, v.port, v.date_reference, v.notes, capaciteValide(v.capacite_20) ? v.capacite_20 : 33, capaciteValide(v.capacite_40) ? v.capacite_40 : 67, u.id],
      );
      await journal(db, id, u, "plan", `Plan créé : « ${v.nom} »`);
      return id;
    });
  });
  if (!r.ok) return r;
  rafraichir();
  redirect(`/conteneurs/dispatch/${id}`);
}

export async function majPlan(planId: number, f: FormData): Promise<Resultat> {
  const lu = lirePlan(f);
  if (!lu.success) return { ok: false, erreur: lu.error.issues[0]?.message ?? "Formulaire incomplet." };
  const r = await sur((u) =>
    transaction(async (db) => {
      const p = await exigerPlan(db, planId);
      const v = lu.data;
      const c20 = capaciteValide(v.capacite_20) ? v.capacite_20! : p.c20;
      const c40 = capaciteValide(v.capacite_40) ? v.capacite_40! : p.c40;
      await db.query("update dispatch_plans set nom=$2, sens=$3, port=$4, date_reference=$5, notes=$6, capacite_20=$7, capacite_40=$8 where id=$1", [
        planId, v.nom, v.sens, v.port, v.date_reference, v.notes, c20, c40,
      ]);
      const changements = await changerCapacites(db, planId, p, c20, c40);
      await journal(db, planId, u, "plan", `Réglages du plan modifiés${changements.length ? ` : ${changements.join(" ; ")}` : ""}`);
    }),
  );
  if (r.ok) rafraichir(planId);
  return r;
}

/** Une nouvelle capacité par taille s'applique aux conteneurs non verrouillés qui avaient l'ancienne. */
async function changerCapacites(db: Db, planId: number, avant: { c20: number; c40: number }, c20: number, c40: number) {
  const changements: string[] = [];
  for (const [taille, ancienne, nouvelle] of [["20", avant.c20, c20], ["40", avant.c40, c40]] as const) {
    if (ancienne === nouvelle) continue;
    await db.query(
      "update dispatch_colonnes set capacite = $3 where plan_id = $1 and genre = 'conteneur' and taille = $2 and verrouillee_le is null and capacite = $4",
      [planId, taille, nouvelle, ancienne],
    );
    changements.push(`${taille} pieds ${m3(ancienne)} → ${m3(nouvelle)}`);
  }
  return changements;
}

export async function supprimerPlan(planId: number): Promise<Resultat> {
  const r = await sur(async () => {
    if (!idValide(planId)) throw new Refus("Plan introuvable.");
    await q("delete from dispatch_plans where id = $1", [planId]);
  });
  if (!r.ok) return r;
  rafraichir();
  redirect("/conteneurs/dispatch");
}

export async function creerDemo(): Promise<Resultat> {
  let id = 0;
  const r = await sur(async (u) => {
    id = await transaction((db) => semerDemo(db, u.id));
  });
  if (!r.ok) return r;
  rafraichir();
  redirect(`/conteneurs/dispatch/${id}`);
}

/** Remet le plan de démonstration dans son état d'origine (un plan réel ne peut pas l'être). */
export async function reinitialiserDemo(planId: number): Promise<Resultat> {
  let id = 0;
  const r = await sur(async (u) => {
    id = await transaction(async (db) => {
      const p = await exigerPlan(db, planId);
      if (!p.demo) throw new Refus("Seul le plan de démonstration peut être remis à zéro.");
      await db.query("delete from dispatch_plans where id = $1", [planId]);
      return semerDemo(db, u.id);
    });
  });
  if (!r.ok) return r;
  rafraichir();
  redirect(`/conteneurs/dispatch/${id}`);
}

/* ───────────── Import ───────────── */

/** Lit un fichier déposé et rend ses feuilles, sans rien enregistrer : la correspondance se choisit à l'écran. */
export async function analyserFichier(f: FormData): Promise<Resultat<{ format: "csv" | "excel"; nom: string; feuilles: Feuille[] }>> {
  return sur(async () => {
    const fichier = f.get("fichier");
    if (!(fichier instanceof File) || fichier.size === 0) throw new Refus("Aucun fichier reçu.");
    if (fichier.size > TAILLE_MAX) throw new Refus("Fichier trop lourd : 10 Mo au plus.");
    try {
      const lu = await lireFichier(fichier.name, new Uint8Array(await fichier.arrayBuffer()));
      return { ...lu, nom: fichier.name };
    } catch (e) {
      throw new Refus(e instanceof Error ? e.message : "Fichier illisible.");
    }
  });
}

const SAISIE = z.object({
  client: z.string().default(""),
  ville: z.string().default(""),
  pays: z.string().default(""),
  volume: z.string().default(""),
  remarques: z.string().default(""),
  dossier: z.string().default(""),
  telephone: z.string().default(""),
});
const IMPORT = z.object({
  source: z.enum(["csv", "excel", "manuel"]),
  fichier: z.string().trim().max(200).nullable(),
  correspondance: z.record(z.string(), z.string()).nullable(),
  lignes: z.array(SAISIE).max(1000, "1 000 lignes au plus par import."),
});

export async function importerLignes(
  planId: number,
  envoi: { source: "csv" | "excel" | "manuel"; fichier: string | null; correspondance: Record<string, string> | null; lignes: LigneSaisie[] },
): Promise<Resultat<{ importees: number; ignorees: number }>> {
  const lu = IMPORT.safeParse(envoi);
  if (!lu.success) return { ok: false, erreur: lu.error.issues[0]?.message ?? "Import illisible." };
  const r = await sur((u) =>
    transaction(async (db) => {
      const p = await exigerPlan(db, planId);
      const dossiers = new Map(
        (await db.query<{ id: number; ref: string }>("select id, upper(ref) as ref from dossiers")).map((d) => [d.ref, d.id] as const),
      );
      const deja = new Set((await db.query<{ client: string; ville: string | null }>("select client, ville from dispatch_lignes where plan_id = $1", [planId])).map(cleDoublon));
      const valides: { l: LigneSaisie; volume: number; dossier: number | null }[] = [];
      let ignorees = 0;
      for (const brute of lu.data.lignes) {
        const l = { ...brute, client: brute.client.trim(), ville: brute.ville.trim(), pays: brute.pays.trim(), remarques: brute.remarques.trim(), telephone: brute.telephone.trim() };
        if (estVide(l)) continue;
        const v = verifierLigne(l, { capaciteMax: Math.max(p.c20, p.c40), dossiers, doublon: deja.has(cleDoublon(l)) });
        if (v.erreurs.length || v.volume == null) {
          ignorees++;
          continue;
        }
        valides.push({ l, volume: v.volume, dossier: dossiers.get(l.dossier.trim().toUpperCase()) ?? null });
      }
      if (!valides.length) throw new Refus("Aucune ligne valide à importer : corrigez les erreurs signalées.");
      const [{ id: importId }] = await db.query<{ id: number }>(
        "insert into dispatch_imports(plan_id, source, fichier, nb_lignes, correspondance, importe_par) values($1,$2,$3,$4,$5,$6) returning id",
        [planId, lu.data.source, lu.data.fichier, valides.length, lu.data.correspondance ? JSON.stringify(lu.data.correspondance) : null, u.id],
      );
      const [{ max }] = await db.query<{ max: number }>("select coalesce(max(rang), 0)::float8 as max from dispatch_lignes where plan_id = $1 and colonne_id is null", [planId]);
      // Une seule requête pour toutes les lignes : les tableaux de valeurs, déroulés côte à côte.
      await db.query(
        `insert into dispatch_lignes(plan_id, import_id, client, ville, pays, volume, remarques, telephone, dossier_id, rang)
         select $1, $2, x.client, nullif(x.ville, ''), nullif(x.pays, ''), x.volume, nullif(x.remarques, ''), nullif(x.telephone, ''), x.dossier, $3 + x.n
         from unnest($4::text[], $5::text[], $6::text[], $7::numeric[], $8::text[], $9::text[], $10::int[]) with ordinality
           as x(client, ville, pays, volume, remarques, telephone, dossier, n)`,
        [
          planId, importId, max,
          valides.map((x) => x.l.client.slice(0, 160)),
          valides.map((x) => x.l.ville.slice(0, 120)),
          valides.map((x) => x.l.pays.slice(0, 120)),
          valides.map((x) => arrondi(x.volume)),
          valides.map((x) => x.l.remarques.slice(0, 1000)),
          valides.map((x) => x.l.telephone.slice(0, 40)),
          valides.map((x) => x.dossier),
        ],
      );
      const origine = lu.data.source === "manuel" ? "saisie manuelle" : `« ${lu.data.fichier ?? "fichier"} » (${lu.data.source === "excel" ? "Excel" : "CSV"})`;
      await journal(db, planId, u, "import", `${valides.length} client${valides.length > 1 ? "s" : ""} importé${valides.length > 1 ? "s" : ""} : ${origine}${ignorees ? `, ${ignorees} ligne${ignorees > 1 ? "s" : ""} écartée${ignorees > 1 ? "s" : ""}` : ""}`, {
        details: { import: importId },
      });
      return { importees: valides.length, ignorees };
    }),
  );
  if (r.ok) rafraichir(planId);
  return r;
}

/* ───────────── Clients du plan ───────────── */

export async function majLigne(planId: number, ligneId: number, champs: LigneSaisie): Promise<Resultat> {
  const lu = SAISIE.safeParse(champs);
  if (!lu.success) return { ok: false, erreur: "Fiche illisible." };
  const r = await sur((u) =>
    transaction(async (db) => {
      const p = await exigerPlan(db, planId);
      const a = (await db.query("select l.*, l.volume::float8 as volume, c.libelle as col, c.verrouillee_le from dispatch_lignes l left join dispatch_colonnes c on c.id = l.colonne_id where l.id = $1 and l.plan_id = $2 for update of l", [ligneId, planId]))[0];
      if (!a) throw new Refus("Ce client n'est plus dans le plan.");
      if (a.verrouillee_le) throw new Refus(`« ${a.col} » est verrouillée : déverrouillez-la pour modifier ce client.`);
      const dossiers = new Map((await db.query<{ id: number; ref: string }>("select id, upper(ref) as ref from dossiers")).map((d) => [d.ref, d.id] as const));
      const l = lu.data;
      const v = verifierLigne(l, { capaciteMax: Math.max(p.c20, p.c40), dossiers });
      if (v.erreurs.length || v.volume == null) throw new Refus(v.erreurs[0]?.texte ?? "Fiche incomplète.");
      const dossier = dossiers.get(l.dossier.trim().toUpperCase()) ?? null;
      const n = {
        client: l.client.trim().slice(0, 160),
        ville: l.ville.trim().slice(0, 120) || null,
        pays: l.pays.trim().slice(0, 120) || null,
        volume: arrondi(v.volume),
        remarques: l.remarques.trim().slice(0, 1000) || null,
        telephone: l.telephone.trim().slice(0, 40) || null,
      };
      await db.query("update dispatch_lignes set client=$3, ville=$4, pays=$5, volume=$6, remarques=$7, telephone=$8, dossier_id=$9 where id=$1 and plan_id=$2", [
        ligneId, planId, n.client, n.ville, n.pays, n.volume, n.remarques, n.telephone, dossier,
      ]);
      const diff: string[] = [];
      if (a.client !== n.client) diff.push(`nom « ${a.client} » → « ${n.client} »`);
      if ((a.ville ?? null) !== n.ville || (a.pays ?? null) !== n.pays) diff.push(`destination ${[a.ville, a.pays].filter(Boolean).join(", ") || "—"} → ${[n.ville, n.pays].filter(Boolean).join(", ") || "—"}`);
      if (Number(a.volume) !== n.volume) diff.push(`volume ${m3(a.volume)} → ${m3(n.volume)}`);
      if ((a.remarques ?? null) !== n.remarques) diff.push("remarques");
      if ((a.telephone ?? null) !== n.telephone) diff.push("téléphone");
      if ((a.dossier_id ?? null) !== dossier) diff.push(dossier ? `rattaché au dossier ${l.dossier.trim().toUpperCase()}` : "rattachement au dossier retiré");
      if (diff.length) await journal(db, planId, u, "ligne", `« ${n.client} » modifié : ${diff.join(", ")}`, { ligne: ligneId, colonne: a.colonne_id });
    }),
  );
  if (r.ok) rafraichir(planId);
  return r;
}

export async function supprimerLigne(planId: number, ligneId: number): Promise<Resultat> {
  const r = await sur((u) =>
    transaction(async (db) => {
      await exigerPlan(db, planId);
      const a = (await db.query("select l.client, l.colonne_id, c.libelle as col, c.verrouillee_le from dispatch_lignes l left join dispatch_colonnes c on c.id = l.colonne_id where l.id = $1 and l.plan_id = $2", [ligneId, planId]))[0];
      if (!a) throw new Refus("Ce client n'est plus dans le plan.");
      if (a.verrouillee_le) throw new Refus(`« ${a.col} » est verrouillée : déverrouillez-la pour retirer ce client.`);
      await db.query("delete from dispatch_lignes where id = $1 and plan_id = $2", [ligneId, planId]);
      await journal(db, planId, u, "ligne", `« ${a.client} » retiré du plan${a.col ? ` (il était dans « ${a.col} »)` : ""}`, { colonne: a.colonne_id });
    }),
  );
  if (r.ok) rafraichir(planId);
  return r;
}

/**
 * Déplace un client : vers une colonne (ou « à répartir » si colonneId est
 * nul), juste avant le client `avantId` (ou en fin de colonne). Le rang est
 * pris à mi-chemin entre ses deux voisins ; quand l'écart devient trop fin,
 * la colonne est renumérotée.
 */
export async function deplacerLigne(planId: number, ligneId: number, colonneId: number | null, avantId: number | null): Promise<Resultat> {
  const r = await sur((u) =>
    transaction(async (db) => {
      await exigerPlan(db, planId);
      const a = (await db.query("select l.id, l.client, l.colonne_id, l.rang, c.libelle as col, c.verrouillee_le from dispatch_lignes l left join dispatch_colonnes c on c.id = l.colonne_id where l.id = $1 and l.plan_id = $2 for update of l", [ligneId, planId]))[0];
      if (!a) throw new Refus("Ce client n'est plus dans le plan : rechargez la page.");
      if (a.verrouillee_le) throw new Refus(`« ${a.col} » est verrouillée : déverrouillez-la pour en sortir un client.`);
      const cible = colonneId == null ? null : await colonneOuverte(db, planId, colonneId);

      const rangDe = async () => {
        if (avantId != null && avantId !== ligneId) {
          const av = (await db.query<{ rang: number }>("select rang from dispatch_lignes where id = $1 and plan_id = $2 and colonne_id is not distinct from $3", [avantId, planId, colonneId]))[0];
          if (av) {
            const prec = (await db.query<{ rang: number | null }>("select max(rang) as rang from dispatch_lignes where plan_id = $1 and colonne_id is not distinct from $2 and rang < $3 and id <> $4", [planId, colonneId, av.rang, ligneId]))[0].rang;
            if (prec == null) return av.rang - 1;
            if (av.rang - prec > 1e-6) return (prec + av.rang) / 2;
            return null; // trop serré : on renumérote
          }
        }
        const fin = (await db.query<{ rang: number | null }>("select max(rang) as rang from dispatch_lignes where plan_id = $1 and colonne_id is not distinct from $2 and id <> $3", [planId, colonneId, ligneId]))[0].rang;
        return (fin ?? 0) + 1;
      };
      let rang = await rangDe();
      if (rang == null) {
        await db.query(
          `update dispatch_lignes l set rang = x.n from (select id, row_number() over (order by rang, id) as n from dispatch_lignes where plan_id = $1 and colonne_id is not distinct from $2) x where l.id = x.id`,
          [planId, colonneId],
        );
        rang = await rangDe();
      }
      await db.query("update dispatch_lignes set colonne_id = $3, rang = $4 where id = $1 and plan_id = $2", [ligneId, planId, colonneId, rang ?? 0]);
      const de = a.col ?? "À répartir", vers = cible?.libelle ?? "À répartir";
      if (a.colonne_id !== colonneId) await journal(db, planId, u, "deplacement", `« ${a.client} » : ${a.col ? `« ${de} »` : de} → ${cible ? `« ${vers} »` : vers}`, { ligne: ligneId, colonne: colonneId, details: { de: a.colonne_id, vers: colonneId } });
      else await journal(db, planId, u, "ordre", `« ${a.client} » change de place dans ${cible ? `« ${vers} »` : "« À répartir »"}`, { ligne: ligneId, colonne: colonneId });
    }),
  );
  if (r.ok) rafraichir(planId);
  return r;
}

/* ───────────── Colonnes ───────────── */

const COLONNE = z.object({
  genre: z.enum(["conteneur", "tournee", "date", "zone"]),
  libelle: z.string().trim().min(1, "Donnez un nom à la colonne.").max(80),
  taille: z.enum(["20", "40"]).nullable().catch(null),
  capacite: nombreOuNul,
  zone: texte(80).nullable(),
  jour: dateOuNulle,
  conteneurId: z.number().int().positive().nullable().catch(null),
});
export type ChampsColonne = z.input<typeof COLONNE>;

function lireColonne(champs: ChampsColonne) {
  const lu = COLONNE.safeParse(champs);
  if (!lu.success) throw new Refus(lu.error.issues[0]?.message ?? "Colonne incomplète.");
  const c = lu.data;
  if (c.capacite != null && (c.capacite <= 0 || c.capacite >= 10000)) throw new Refus("Capacité hors limites.");
  return { ...c, taille: c.genre === "conteneur" ? c.taille : null, conteneurId: c.genre === "conteneur" ? c.conteneurId : null };
}

export async function creerColonne(planId: number, champs: ChampsColonne): Promise<Resultat<{ id: number }>> {
  const r = await sur((u) =>
    transaction(async (db) => {
      const p = await exigerPlan(db, planId);
      const c = lireColonne(champs);
      const capacite = c.capacite ?? (c.genre === "conteneur" ? capacitePour(c.taille, { capacite20: p.c20, capacite40: p.c40 }) : null);
      const [{ id }] = await db.query<{ id: number }>(
        `insert into dispatch_colonnes(plan_id, genre, libelle, taille, capacite, zone, jour, conteneur_id, ordre)
         values($1,$2,$3,$4,$5,$6,$7,$8, (select coalesce(max(ordre), 0) + 1 from dispatch_colonnes where plan_id = $1)) returning id`,
        [planId, c.genre, c.libelle, c.taille, capacite, c.zone, c.jour, c.conteneurId],
      );
      await journal(db, planId, u, "colonne", `Colonne ajoutée : « ${c.libelle} » (${GENRES[c.genre].nom.toLowerCase()}${c.taille ? ` ${c.taille} pieds` : ""}${capacite ? `, ${m3(capacite)}` : ""})`, { colonne: id });
      return { id };
    }),
  );
  if (r.ok) rafraichir(planId);
  return r;
}

export async function majColonne(planId: number, colonneId: number, champs: ChampsColonne): Promise<Resultat> {
  const r = await sur((u) =>
    transaction(async (db) => {
      await exigerPlan(db, planId);
      const avant = await colonneOuverte(db, planId, colonneId);
      const c = lireColonne(champs);
      await db.query("update dispatch_colonnes set genre=$3, libelle=$4, taille=$5, capacite=$6, zone=$7, jour=$8, conteneur_id=$9 where id=$1 and plan_id=$2", [
        colonneId, planId, c.genre, c.libelle, c.taille, c.capacite, c.zone, c.jour, c.conteneurId,
      ]);
      await journal(db, planId, u, "colonne", `Colonne « ${avant.libelle} » modifiée${avant.libelle !== c.libelle ? ` (devient « ${c.libelle} »)` : ""}${c.capacite ? ` · capacité ${m3(c.capacite)}` : ""}`, { colonne: colonneId });
    }),
  );
  if (r.ok) rafraichir(planId);
  return r;
}

export async function supprimerColonne(planId: number, colonneId: number): Promise<Resultat> {
  const r = await sur((u) =>
    transaction(async (db) => {
      await exigerPlan(db, planId);
      const c = await colonneOuverte(db, planId, colonneId);
      // Ses clients reviennent « à répartir », après ceux qui y sont déjà.
      const rendus = await db.query("update dispatch_lignes set colonne_id = null, rang = rang + 100000 where colonne_id = $1 and plan_id = $2 returning id", [colonneId, planId]);
      await db.query("delete from dispatch_colonnes where id = $1 and plan_id = $2", [colonneId, planId]);
      const n = rendus.length;
      await journal(db, planId, u, "colonne", `Colonne supprimée : « ${c.libelle} »${n ? ` (${n} client${n > 1 ? "s" : ""} revien${n > 1 ? "nent" : "t"} à répartir)` : ""}`);
    }),
  );
  if (r.ok) rafraichir(planId);
  return r;
}

export async function deplacerColonne(planId: number, colonneId: number, sens: -1 | 1): Promise<Resultat> {
  const r = await sur(() =>
    transaction(async (db) => {
      await exigerPlan(db, planId);
      const cols = await db.query<{ id: number; ordre: number }>("select id, ordre from dispatch_colonnes where plan_id = $1 order by ordre, id for update", [planId]);
      const i = cols.findIndex((c) => c.id === colonneId);
      const j = i + sens;
      if (i < 0 || j < 0 || j >= cols.length) return;
      [cols[i], cols[j]] = [cols[j], cols[i]];
      await db.query(
        "update dispatch_colonnes c set ordre = x.n from unnest($2::int[]) with ordinality as x(id, n) where c.id = x.id and c.plan_id = $1",
        [planId, cols.map((c) => c.id)],
      );
    }),
  );
  if (r.ok) rafraichir(planId);
  return r;
}

/** Valide et verrouille une colonne (ou la déverrouille). Une colonne verrouillée ne bouge plus, et aucune proposition n'y touche. */
export async function verrouiller(planId: number, colonneId: number, fermer: boolean): Promise<Resultat> {
  const r = await sur((u) =>
    transaction(async (db) => {
      await exigerPlan(db, planId);
      const c = (await db.query("select id, libelle, verrouillee_le, capacite::float8 as capacite from dispatch_colonnes where id = $1 and plan_id = $2 for update", [colonneId, planId]))[0];
      if (!c) throw new Refus("Cette colonne n'existe plus : rechargez la page.");
      if (!!c.verrouillee_le === fermer) return;
      const [{ n, v }] = await db.query<{ n: number; v: number }>("select count(*)::int as n, coalesce(sum(volume), 0)::float8 as v from dispatch_lignes where colonne_id = $1", [colonneId]);
      await db.query("update dispatch_colonnes set verrouillee_le = $3, verrouillee_par = $4 where id = $1 and plan_id = $2", [colonneId, planId, fermer ? new Date() : null, fermer ? u.id : null]);
      const j = jauge(v, c.capacite);
      await journal(
        db, planId, u, fermer ? "verrouillage" : "deverrouillage",
        fermer
          ? `« ${c.libelle} » validée et verrouillée : ${n} client${n > 1 ? "s" : ""}, ${m3(v)}${j.etat === "depasse" ? ` (dépasse la capacité de ${m3(-(j.reste ?? 0))})` : ""}`
          : `« ${c.libelle} » déverrouillée : elle peut de nouveau être modifiée`,
        { colonne: colonneId },
      );
    }),
  );
  if (r.ok) rafraichir(planId);
  return r;
}

/* ───────────── Proposition de regroupement ───────────── */

const PARAMETRES = z.object({
  methode: z.enum(["ia", "regles"]),
  mode: z.enum(["conteneur", "tournee"]),
  repartir: z.enum(["non_places", "tout"]),
  garderColonnes: z.boolean(),
  nouvellesColonnes: z.boolean(),
  capacite20: z.number().positive().max(999),
  capacite40: z.number().positive().max(999),
  capaciteTournee: z.number().positive().max(999).nullable(),
  contraintes: z.string().max(2000),
});

/** Ce que la proposition peut placer, et où, selon les paramètres. */
async function contexte(db: Db, planId: number, parametres: Parametres): Promise<Contexte> {
  const { lignes, colonnes } = await lignesEtColonnes(db, planId);
  const ouvertes = colonnes.filter((c) => !estVerrouillee(c));
  const idsOuverts = new Set(ouvertes.map((c) => c.id));
  const aPlacer = lignes.filter((l) => l.colonneId == null || (parametres.repartir === "tout" && idsOuverts.has(l.colonneId)));
  const restantes = parametres.repartir === "tout" ? [] : lignes.filter((l) => l.colonneId != null && idsOuverts.has(l.colonneId));
  return { lignes: aPlacer, colonnes: parametres.garderColonnes ? ouvertes : [], restantes, parametres };
}

export async function proposer(planId: number, parametres: Parametres): Promise<Resultat<Proposition>> {
  const lu = PARAMETRES.safeParse(parametres);
  if (!lu.success) return { ok: false, erreur: "Paramètres de la proposition illisibles." };
  const r = await sur(async (u) => {
    const params = lu.data;
    // Les capacités font partie des réglages du plan : modifiées ici, elles y sont enregistrées.
    const changements = await transaction(async (db) => {
      const p = await exigerPlan(db, planId);
      if (p.c20 === params.capacite20 && p.c40 === params.capacite40) return [];
      await db.query("update dispatch_plans set capacite_20 = $2, capacite_40 = $3 where id = $1", [planId, params.capacite20, params.capacite40]);
      return changerCapacites(db, planId, p, params.capacite20, params.capacite40);
    });
    const ctx = await contexte(SURQ, planId, params);
    if (!ctx.lignes.length) throw new Refus(params.repartir === "non_places" ? "Aucun client à répartir : tous sont déjà placés. Choisissez « Tous les clients des colonnes non verrouillées » pour tout reproposer." : "Aucun client à placer hors des colonnes verrouillées.");
    if (!ctx.colonnes.length && !params.nouvellesColonnes) throw new Refus("Aucune colonne ouverte à remplir : autorisez la création de colonnes, ou ajoutez-en une.");

    const debut = Date.now();
    let contenu: ContenuProposition, methode: "ia" | "regles" = params.methode, modele: string | null = null, repli: string | null = null;
    if (params.methode === "ia") {
      try {
        ({ contenu, modele } = await proposerParIa(ctx));
      } catch (e) {
        repli = e instanceof Error ? e.message : "elle est indisponible";
        methode = "regles";
        contenu = finaliser(regrouperParRegles(ctx), ctx);
      }
    } else contenu = finaliser(regrouperParRegles(ctx), ctx);
    const duree = Date.now() - debut;

    return transaction(async (db) => {
      await db.query("update dispatch_propositions set statut = 'ecartee', traitee_le = now() where plan_id = $1 and statut = 'proposee'", [planId]);
      const [row] = await db.query(
        "insert into dispatch_propositions(plan_id, methode, modele, repli, duree_ms, parametres, contenu, demandee_par) values($1,$2,$3,$4,$5,$6,$7,$8) returning id, cree_le",
        [planId, methode, modele, repli, duree, JSON.stringify(params), JSON.stringify(contenu), u.id],
      );
      const places = contenu.colonnes.reduce((s, c) => s + c.lignes.length, 0);
      const qui = methode === "ia" ? `de l'IA (${modele})` : repli ? `par les règles simples, l'IA n'ayant pas pu proposer (${repli})` : "par les règles simples";
      await journal(db, planId, u, "proposition", `Proposition ${qui} : ${places} client${places > 1 ? "s" : ""} sur ${ctx.lignes.length} placé${places > 1 ? "s" : ""}${changements.length ? ` · capacités : ${changements.join(" ; ")}` : ""}`, { details: { proposition: row.id } });
      const prop: Proposition = { id: row.id, methode, modele, repli, dureeMs: duree, statut: "proposee", creeLe: new Date(row.cree_le).toISOString(), parametres: params, ...contenu };
      return prop;
    });
  });
  if (r.ok) rafraichir(planId);
  return r;
}

/** Applique la proposition au planning, dans une transaction : rien n'est écrit si une colonne a été verrouillée entre-temps. */
export async function appliquerProposition(planId: number, propositionId: number): Promise<Resultat<{ places: number; creees: number }>> {
  const r = await sur((u) =>
    transaction(async (db) => {
      await exigerPlan(db, planId);
      const row = (await db.query("select * from dispatch_propositions where id = $1 and plan_id = $2 for update", [propositionId, planId]))[0];
      if (!row || row.statut !== "proposee") throw new Refus("Cette proposition a déjà été appliquée ou écartée.");
      const params = row.parametres as Parametres;
      const contenu = row.contenu as ContenuProposition;
      const { lignes, colonnes } = await lignesEtColonnes(db, planId);
      const parId = new Map(colonnes.map((c) => [c.id, c]));
      const ouvertes = new Set(colonnes.filter((c) => !estVerrouillee(c)).map((c) => c.id));
      const lignesParId = new Map(lignes.map((l) => [l.id, l]));

      for (const c of contenu.colonnes) {
        if (c.colonneId == null) continue;
        const col = parId.get(c.colonneId);
        if (!col) throw new Refus(`La colonne « ${c.libelle} » a été supprimée depuis : relancez la proposition.`);
        if (estVerrouillee(col)) throw new Refus(`« ${col.libelle} » a été verrouillée depuis : relancez la proposition.`);
      }
      // Les clients encore placables : à répartir, ou (si « tout ») dans une colonne ouverte.
      const placable = (id: number) => {
        const l = lignesParId.get(id);
        return !!l && (l.colonneId == null || (params.repartir === "tout" && ouvertes.has(l.colonneId)));
      };
      if (params.repartir === "tout") {
        await db.query("update dispatch_lignes set colonne_id = null, rang = rang + 100000 where plan_id = $1 and colonne_id = any($2::int[])", [planId, [...ouvertes]]);
      }
      let places = 0, creees = 0, ordre = Math.max(0, ...colonnes.map((c) => c.ordre));
      for (const c of contenu.colonnes) {
        const ids = c.lignes.filter(placable);
        let id = c.colonneId;
        if (id == null) {
          if (!ids.length) continue;
          [{ id }] = await db.query<{ id: number }>(
            "insert into dispatch_colonnes(plan_id, genre, libelle, taille, capacite, zone, ordre) values($1,$2,$3,$4,$5,$6,$7) returning id",
            [planId, c.genre, c.libelle, c.taille, c.capacite, c.zone, ++ordre],
          );
          creees++;
        }
        if (!ids.length) continue;
        const [{ max }] = await db.query<{ max: number }>("select coalesce(max(rang), 0)::float8 as max from dispatch_lignes where colonne_id = $1", [id]);
        await db.query(
          "update dispatch_lignes l set colonne_id = $2, rang = $3 + x.n from unnest($4::int[]) with ordinality as x(id, n) where l.id = x.id and l.plan_id = $1",
          [planId, id, max, ids],
        );
        places += ids.length;
        // Une ligne d'historique par client : sa fiche dit d'où il vient et pourquoi il a bougé.
        const par = row.methode === "ia" ? "proposition de l'IA" : "proposition par règles";
        const libelles = ids.map((x) => {
          const l = lignesParId.get(x)!;
          const de = l.colonneId != null ? `« ${parId.get(l.colonneId)?.libelle ?? "?"} »` : "À répartir";
          return `« ${l.client} » : ${de} → « ${c.libelle} » (${par})`;
        });
        const changes = ids.map((x, i) => [x, libelles[i]] as const).filter(([x]) => lignesParId.get(x)!.colonneId !== id);
        if (changes.length)
          await db.query(
            "insert into dispatch_historique(plan_id, ligne_id, colonne_id, action, libelle, utilisateur_id) select $1, x.id, $2, 'deplacement', x.libelle, $3 from unnest($4::int[], $5::text[]) as x(id, libelle)",
            [planId, id, u.id, changes.map(([x]) => x), changes.map(([, t]) => t)],
          );
      }
      await db.query("update dispatch_propositions set statut = 'appliquee', traitee_le = now() where id = $1", [propositionId]);
      await journal(
        db, planId, u, "application",
        `Proposition ${row.methode === "ia" ? "de l'IA" : "par règles simples"} appliquée : ${places} client${places > 1 ? "s" : ""} placé${places > 1 ? "s" : ""}${creees ? `, ${creees} colonne${creees > 1 ? "s" : ""} créée${creees > 1 ? "s" : ""}` : ""}`,
        { details: { proposition: propositionId } },
      );
      return { places, creees };
    }),
  );
  if (r.ok) rafraichir(planId);
  return r;
}

export async function ecarterProposition(planId: number, propositionId: number): Promise<Resultat> {
  const r = await sur(async (u) =>
    transaction(async (db) => {
      await exigerPlan(db, planId);
      const n = await db.query("update dispatch_propositions set statut = 'ecartee', traitee_le = now() where id = $1 and plan_id = $2 and statut = 'proposee' returning methode", [propositionId, planId]);
      if (n.length) await journal(db, planId, u, "proposition", `Proposition ${n[0].methode === "ia" ? "de l'IA" : "par règles simples"} écartée sans être appliquée`);
    }),
  );
  if (r.ok) rafraichir(planId);
  return r;
}
