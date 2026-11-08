#!/usr/bin/env node
/*
 * Données FICTIVES de démonstration de l'espace RH, sur l'espace pro Carrefour
 * (demande de David, 08/11/2026 : « crée des données fictives dans l'espace RH
 * sur Carrefour que je puisse voir »).
 *
 *   node scripts/demo-rh-carrefour.mjs creer       pose la démonstration (ou la remet à neuf)
 *   node scripts/demo-rh-carrefour.mjs supprimer   retire tout ce qu'elle a posé
 *
 * Ce qui est posé, dans la base partagée (schémas public et crm) :
 *  - 4 demandes de l'espace pro Carrefour (public.requests), écrites comme le
 *    formulaire de l'espace pro les écrit (raw_payload.espace, mutation_pro,
 *    societe), avec leurs traces (request_events), les estimations du site
 *    (public.devis) et un rappel demandé ;
 *  - au CRM : un compte « Service mobilité Carrefour » et 6 salariés rattachés
 *    à Carrefour (crm.clients.espace_pro_id), un payeur personnel non
 *    rattaché, 6 dossiers de Visite à faire à Terminé, leurs trajets, devis,
 *    visites, factures (lignes, payeur figé) et règlements — avec les colonnes
 *    et les conventions du CRM (devis saisis HT, factures EN 16931).
 *
 * Tout se reconnaît, et rien ne peut se confondre avec le réel :
 *  - adresses e-mail en @example.com, et la note « Fictif — démo espace RH
 *    Carrefour » sur chaque client et chaque dossier ;
 *  - références dans une plage à part, l'an 9999 : dossiers BD-9999-81xx,
 *    devis DV-9999-81xx, factures FA-9999-81xx, estimations DEV-9999-81xx —
 *    la numérotation du CRM (BD-2026-…, FA-2026-…) n'en tient pas compte ;
 *  - les demandes portent raw_payload.demo_rh = « carrefour ».
 * Les factures sont datées au plus tard de la dernière facture réelle : la
 * règle « numérotation chronologique » du CRM ne s'en trouve pas gênée.
 *
 * Ni espace client, ni compte de connexion, ni message envoyé, ni journal
 * (crm.journal) : seulement des lignes. « supprimer » retire aussi ce que
 * l'équipe aurait pu ajouter en manipulant ces dossiers (journal, activité,
 * rappels, relances, appels, rendez-vous, SMS de rendez-vous).
 *
 * Variables : DATABASE_URL (pooler, mode session), NEXT_PUBLIC_SUPABASE_URL
 * et SUPABASE_SERVICE_ROLE_KEY (pour lire l'espace pro Carrefour s'il a été
 * réglé), lues dans apps/interne/.env.local — jamais affichées.
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import pg from "pg";

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ENV = path.join(RACINE, "apps/interne/.env.local");

const MARQUE = "Fictif — démo espace RH Carrefour";
const ETIQUETTE = "carrefour";
const EMAIL = (local) => `${local}.demo-rh-carrefour@example.com`;
const REF = (n) => `BD-9999-${8100 + n}`;
const DV = (n) => `DV-9999-${8100 + n}`;
const FA = (n) => `FA-9999-${8100 + n}`;
const DEV = (n) => `DEV-9999-${8100 + n}`;

const mode = process.argv[2];
if (mode !== "creer" && mode !== "supprimer") {
  console.error("Usage : node scripts/demo-rh-carrefour.mjs creer|supprimer");
  process.exit(1);
}

/* ─────────────── L'environnement, sans rien afficher ─────────────── */

function lireEnv(fichier) {
  if (!existsSync(fichier)) return {};
  return Object.fromEntries(
    readFileSync(fichier, "utf8")
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => /^[A-Z0-9_]+=/.test(l))
      .map((l) => {
        const i = l.indexOf("=");
        return [l.slice(0, i), l.slice(i + 1).replace(/^["']|["']$/g, "")];
      }),
  );
}
const env = { ...lireEnv(ENV), ...Object.fromEntries(Object.entries(process.env).filter(([k]) => /^(DATABASE_URL|NEXT_PUBLIC_SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY)$/.test(k))) };
if (!env.DATABASE_URL) {
  console.error(`DATABASE_URL manque (attendue dans ${path.relative(RACINE, ENV)}).`);
  process.exit(1);
}

/* ─────────────── Les dates, à l'heure de Paris ─────────────── */

const PARIS = new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" });
const aujourdhui = PARIS.format(new Date()); // AAAA-MM-JJ
const jour = (decalage) => {
  const d = new Date(`${aujourdhui}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + decalage);
  return d.toISOString().slice(0, 10);
};
const premierDuMois = (decalageMois) => {
  const d = new Date(`${aujourdhui.slice(0, 7)}-01T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + decalageMois);
  return d.toISOString().slice(0, 10);
};
const MOIS = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];
const periodeDe = (iso) => `${MOIS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;

/** L'instant d'une heure de Paris un jour donné (le décalage d'hiver ou d'été est relu, pas supposé). */
function instantParis(iso, heure) {
  const [h, m] = heure.split(":").map(Number);
  const utc = Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)), h, m);
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Paris", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
      .formatToParts(new Date(utc))
      .map((x) => [x.type, x.value]),
  );
  const vu = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute));
  return new Date(utc - (vu - utc));
}
/** Un horodatage il y a `j` jours, à une heure de bureau. */
const ilYa = (j, heure = "10:30") => instantParis(jour(-j), heure);

const arrondi = (n) => Math.round(n * 100) / 100;

/* ─────────────── L'espace pro Carrefour ─────────────── */

/**
 * Ce qu'une demande retient de son espace (lib/espaces.ts, instantane) : lu
 * dans le stockage des espaces pro s'ils ont été réglés depuis l'équipe, sinon
 * les valeurs de départ des grands comptes (prix et volume masqués).
 */
async function espaceCarrefour() {
  const defaut = { id: "carrefour", slug: "carrefour", nom: "Carrefour", ajustement_volume: 0, afficher_volume: false, afficher_estimation: false, envoyer_devis: false };
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return defaut;
  try {
    const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    const { data } = await sb.storage.from("espaces-pro").download("espaces.json");
    if (!data) return defaut;
    const j = JSON.parse(await data.text());
    const e = (j.espaces ?? []).find((x) => x.slug === "carrefour");
    if (!e) return defaut;
    const r = e.grand_compte ? { ...e, ...Object.fromEntries(Object.entries(j.regles ?? {}).filter(([k]) => !(e.propres ?? []).includes(k))) } : e;
    return {
      id: e.id,
      slug: e.slug,
      nom: e.nom,
      ajustement_volume: Number(r.ajustement_volume) || 0,
      afficher_volume: r.afficher_volume !== false,
      afficher_estimation: r.afficher_estimation !== false,
      envoyer_devis: r.envoyer_devis !== false,
    };
  } catch {
    return defaut;
  }
}

/* ─────────────── Le jeu ─────────────── */

/** Les demandes de l'espace pro : deux reçues, deux estimées (dont une avec un rappel demandé). */
const DEMANDES = [
  {
    n: 1, statut: "new", cree: 1, nom: "Sophie Lefort", tel: "06 01 81 00 01", local: "sophie.lefort",
    depart: { adresse: "14 allée des Démonstrations", cp: "91300", ville: "Massy", etage: 2, ascenseur: true, surface: 62, type: "appartement" },
    arrivee: { adresse: "3 quai Fictif", cp: "44000", ville: "Nantes", etage: 0, ascenseur: false, surface: 85, type: "maison" },
    date: 46, volume: 28, distance: 385, formule: "standard",
  },
  {
    n: 2, statut: "qualified", cree: 6, nom: "Thomas Garnier", tel: "06 01 81 00 02", local: "thomas.garnier",
    depart: { adresse: "27 rue de l'Exemple", cp: "59000", ville: "Lille", etage: 4, ascenseur: true, surface: 48, type: "appartement" },
    arrivee: { adresse: "9 cours de la Démo", cp: "33000", ville: "Bordeaux", etage: 1, ascenseur: false, surface: 55, type: "appartement" },
    date: 58, volume: 22, distance: 805, formule: "eco", ht: 2450, score: 58, difficulte: 41,
  },
  {
    n: 3, statut: "qualified", cree: 4, nom: "Nadia Haddad", tel: "06 01 81 00 03", local: "nadia.haddad",
    depart: { adresse: "5 place du Test", cp: "69007", ville: "Lyon", etage: 3, ascenseur: false, surface: 96, type: "appartement" },
    arrivee: { adresse: "41 boulevard Fictif", cp: "35000", ville: "Rennes", etage: 0, ascenseur: false, surface: 120, type: "maison" },
    date: 33, volume: 41, distance: 700, formule: "luxe", ht: 5600, score: 74, difficulte: 63, rappel: "Le matin, entre 9 h et 12 h",
  },
  {
    n: 4, statut: "new", cree: 0, nom: "Julien Moreau", tel: "06 01 81 00 04", local: "julien.moreau",
    depart: { adresse: "18 rue de la Maquette", cp: "67000", ville: "Strasbourg", etage: 1, ascenseur: false, surface: 38, type: "appartement" },
    arrivee: { adresse: "2 traverse de l'Essai", cp: "13008", ville: "Marseille", etage: 2, ascenseur: true, surface: 45, type: "appartement" },
    date: 72, volume: 18, distance: 805, formule: "eco",
  },
];

/**
 * Les dossiers du CRM. `payeur` : « entreprise » (le compte Carrefour paie),
 * « client » (le salarié rattaché est son propre payeur : l'entreprise paie
 * aussi, par la règle de l'espace RH), « personnel » (un payeur à part, non
 * rattaché : payé par le salarié).
 */
const DOSSIERS = [
  {
    n: 1, statut: "visite", cree: 9, payeur: "entreprise",
    client: { civilite: "Madame", prenom: "Claire", nom: "Dubois", local: "claire.dubois", tel: "06 01 81 01 01" },
    depart: ["8 rue de la Démo", "75015", "Paris", "4", true], arrivee: ["12 montée Fictive", "69006", "Lyon", "2", true],
    volume: 38, mois: 2, visite: { dans: 1, type: "phys" },
  },
  {
    n: 2, statut: "devis", cree: 21, payeur: "entreprise",
    client: { civilite: "Monsieur", prenom: "Romain", nom: "Petit", local: "romain.petit", tel: "06 01 81 01 02" },
    depart: ["30 rue de l'Échantillon", "44000", "Nantes", "RDC", false], arrivee: ["6 rue du Modèle", "13008", "Marseille", "3", true],
    volume: 45, mois: 1, formule: "premium", ht: 6900, distance: 990, envoye: 5, visitePassee: 12,
  },
  {
    n: 3, statut: "commande", cree: 30, payeur: "client",
    client: { civilite: "Madame", prenom: "Julie", nom: "Martin", local: "julie.martin", tel: "06 01 81 01 03" },
    depart: ["4 avenue de l'Essai", "59000", "Lille", "1", false], arrivee: ["15 rue Témoin", "38000", "Grenoble", "2", true],
    volume: 30, mois: 1, formule: "standard", ht: 4250, distance: 780, envoye: 20, signe: 12, visitePassee: 24, acompte: { emise: 11, regle: 6 },
  },
  {
    n: 4, statut: "planifie", cree: 34, payeur: "entreprise",
    client: { civilite: "Monsieur", prenom: "Antoine", nom: "Leroy", local: "antoine.leroy", tel: "06 01 81 01 04" },
    depart: ["22 cours Fictif", "33000", "Bordeaux", "3", true], arrivee: ["7 allée de la Démo", "31000", "Toulouse", "RDC", false],
    volume: 24, chargement: 4, livraison: 5, formule: "economique", ht: 2300, distance: 245, envoye: 26, signe: 19,
  },
  {
    n: 5, statut: "planifie", cree: 27, payeur: "personnel",
    client: { civilite: "Madame", prenom: "Inès", nom: "Roussel", local: "ines.roussel", tel: "06 01 81 01 05" },
    payeurPersonnel: { civilite: "Monsieur", prenom: "Paul", nom: "Roussel", local: "paul.roussel", tel: "06 01 81 01 15" },
    depart: ["11 rue de l'Exemple", "13006", "Marseille", "2", false], arrivee: ["5 promenade Fictive", "06000", "Nice", "5", true],
    volume: 20, chargement: 16, livraison: 16, formule: "standard", ht: 2650, distance: 200, envoye: 18, signe: 14,
  },
  {
    n: 6, statut: "termine", cree: 75, payeur: "entreprise",
    client: { civilite: "Monsieur", prenom: "Camille", nom: "Fontaine", local: "camille.fontaine", tel: "06 01 81 01 06" },
    depart: ["19 boulevard de l'Essai", "35000", "Rennes", "2", true], arrivee: ["3 rue du Démonstrateur", "75012", "Paris", "6", true],
    volume: 52, chargement: -40, livraison: -39, formule: "premium", ht: 7800, distance: 350, envoye: 62, signe: 55, visitePassee: 66,
    acompte: { emise: 54, regle: 50 }, solde: { emise: 36, echeance: 21 },
  },
];

const PRESTATIONS = [
  "Fournitures nécessaires : cartons et adhésifs", "Emballage des objets fragiles (bacs plastiques, cartons à verres)", "Mise en penderies des vêtements sur cintres",
  "Démontage des meubles et remontage", "Protection du mobilier (housses, couvertures)", "Chargement et arrimage dans le camion", "Transport",
  "Déchargement et mise en place selon vos instructions", "Déballage des objets fragiles et de la vaisselle", "Déballage des livres, du linge et des objets non fragiles",
  "Évacuation des emballages", "Fixation des éléments aux murs et plafonds",
];
// Les prestations comprises par formule : celles du CRM (src/crm/lib/tarif.ts, prestationsPour).
const PAR_FORMULE = { premium: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10], standard: [0, 1, 3, 4, 5, 6, 7], economique: [3, 4, 5, 6, 7] };
const prestationsPour = (f) => PRESTATIONS.map((libelle, i) => ({ id: `p${i}`, libelle, charge: PAR_FORMULE[f].includes(i) ? "bailly" : "client" }));
const NOM_FORMULE = { economique: "Économique", standard: "Standard", premium: "Premium" };

/* ─────────────── Retirer ─────────────── */

async function retirer(db) {
  const demandes = (await db.query("select id from public.requests where raw_payload->>'demo_rh' = $1", [ETIQUETTE])).rows.map((r) => r.id);
  const clients = (await db.query("select id from crm.clients where notes = $1 and email like '%@example.com'", [MARQUE])).rows.map((r) => r.id);
  const dossiers = (await db.query("select id from crm.dossiers where ref like 'BD-9999-81%' and client_id = any($1::int[])", [clients])).rows.map((r) => r.id);
  const rdv = (await db.query("select id from crm.rendez_vous where dossier_id = any($1::int[])", [dossiers])).rows.map((r) => r.id);
  const n = {};
  const effacer = async (cle, sql, p) => {
    n[cle] = (n[cle] ?? 0) + (await db.query(sql, p)).rowCount;
  };
  await effacer(
    "journal",
    `delete from crm.journal where dossier_id = any($1::int[]) or request_id = any($2::uuid[])
       or (objet_type in ('client','contact') and objet_id = any($3::text[])) or (objet_type = 'dossier' and objet_id = any($4::text[]))`,
    [dossiers, demandes, clients.map(String), dossiers.map(String)],
  );
  await effacer("appels", "delete from crm.appels where dossier_id = any($1::int[]) or request_id = any($2::uuid[])", [dossiers, demandes]);
  await effacer("relances", "delete from crm.relances where dossier_id = any($1::int[])", [dossiers]);
  await effacer("rdv_sms", "delete from crm.rdv_sms where rendez_vous_id = any($1::int[])", [rdv]);
  await effacer("rendez_vous", "delete from crm.rendez_vous where id = any($1::int[])", [rdv]);
  await effacer("paiements", "delete from crm.paiements where dossier_id = any($1::int[])", [dossiers]);
  // Les factures de solde d'abord : elles déduisent les factures d'arrhes.
  await effacer("factures", "delete from crm.factures where dossier_id = any($1::int[]) and genre <> 'acompte'", [dossiers]);
  await effacer("factures", "delete from crm.factures where dossier_id = any($1::int[])", [dossiers]);
  await effacer("devis", "delete from crm.devis where dossier_id = any($1::int[])", [dossiers]);
  await effacer("dossiers", "delete from crm.dossiers where id = any($1::int[])", [dossiers]);
  await effacer("clients", "delete from crm.clients where id = any($1::int[])", [clients]);
  await effacer("evenements", "delete from public.request_events where request_id = any($1::uuid[])", [demandes]);
  await effacer("estimations", "delete from public.devis where request_id = any($1::uuid[])", [demandes]);
  await effacer("meubles", "delete from public.request_items where request_id = any($1::uuid[])", [demandes]);
  await effacer("photos", "delete from public.request_photos where request_id = any($1::uuid[])", [demandes]);
  await effacer("emails", "delete from public.emails_recus where request_id = any($1::uuid[])", [demandes]);
  await effacer("demandes", "delete from public.requests where id = any($1::uuid[])", [demandes]);
  return n;
}

/* ─────────────── Poser ─────────────── */

async function poser(db, espace) {
  const un = async (sql, p) => (await db.query(sql, p)).rows[0];

  // Le commercial des dossiers : le premier commercial du CRM (c'est lui qui paraît en interlocuteur dans l'espace RH).
  const commercial = (await un("select id, nom from crm.utilisateurs where role = 'commercial' order by id limit 1")) ?? (await un("select id, nom from crm.utilisateurs order by id limit 1"));
  if (!commercial) throw new Error("Aucun utilisateur au CRM : démarrez d'abord l'app interne.");
  // Les factures ne passent pas devant la dernière facture réelle (la numérotation du CRM reste chronologique).
  const derniereFacture = (await un("select max(emise_le)::text as d from crm.factures where numero like 'FA-2%'"))?.d ?? aujourdhui;
  const auPlusTard = (iso) => (iso > derniereFacture ? derniereFacture : iso);

  /* Les clients du CRM. */
  const client = async (c, { type = "particulier", societe = null, rattache = true, facturation = null } = {}) =>
    (
      await un(
        `insert into crm.clients(type, civilite, prenom, nom, societe, email, telephone, notes, espace_pro_id, facturation_adresse, facturation_cp, facturation_ville, facturation_pays, cree_le)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13, now() - interval '80 days') returning *`,
        [type, c.civilite ?? null, c.prenom ?? null, c.nom, societe, EMAIL(c.local), c.tel ?? null, MARQUE, rattache ? espace.id : null,
          facturation?.[0] ?? null, facturation?.[1] ?? null, facturation?.[2] ?? null, facturation ? "France" : null],
      )
    );
  const compte = await client(
    { prenom: "Service", nom: "Mobilité", local: "mobilite", tel: "01 00 81 00 00" },
    { type: "compte", societe: "Carrefour — Service mobilité (fictif)", facturation: ["1 rue de la Démonstration", "91000", "Évry-Courcouronnes"] },
  );

  const payeurFige = (c) => ({
    clientId: c.id, type: c.type, nom: c.societe || [c.prenom, c.nom].filter(Boolean).join(" "), contact: c.societe ? [c.civilite, c.prenom, c.nom].filter(Boolean).join(" ") || null : null,
    email: c.email, telephone: c.telephone, adresse: c.facturation_adresse, codePostal: c.facturation_cp, ville: c.facturation_ville, pays: c.facturation_pays, siren: null, tvaIntracom: null,
  });

  const cree = { clients: 1, dossiers: [], devis: [], factures: [], reglements: 0, visites: 0, demandes: [], estimations: [], rappels: 0 };

  for (const d of DOSSIERS) {
    const salarie = await client(d.client, { facturation: [d.depart[0], d.depart[1], d.depart[2]] });
    cree.clients++;
    let payeur = null;
    if (d.payeur === "entreprise") payeur = compte;
    if (d.payeur === "personnel") {
      payeur = await client(d.payeurPersonnel, { rattache: false, facturation: [d.depart[0], d.depart[1], d.depart[2]] });
      cree.clients++;
    }
    const chargement = d.chargement != null ? jour(d.chargement) : null;
    const moisCa = chargement ? `${chargement.slice(0, 7)}-01` : premierDuMois(d.mois);
    const dossier = await un(
      `insert into crm.dossiers(ref, client_id, payeur_client_id, commercial_id, traite_par_id, statut, periode, mois_ca, date_chargement, date_livraison, volume, observations, type_demenagement, cree_le, maj_le)
       values ($1,$2,$3,$4,$4,$5,$6,$7,$8,$9,$10,$11,'national',$12, now()) returning id, ref`,
      [REF(d.n), salarie.id, payeur?.id ?? null, commercial.id, d.statut, periodeDe(moisCa), moisCa, chargement, d.livraison != null ? jour(d.livraison) : null, d.volume, MARQUE, ilYa(d.cree)],
    );
    cree.dossiers.push(`${dossier.ref} ${d.client.prenom} ${d.client.nom}`);
    await db.query(
      `insert into crm.etapes_trajet(dossier_id, ordre, genre, adresse, etage, ascenseur) values ($1,0,'depart',$2,$3,$4), ($1,1,'arrivee',$5,$6,$7)`,
      [dossier.id, `${d.depart[0]}, ${d.depart[1]} ${d.depart[2]}`, d.depart[3], d.depart[4], `${d.arrivee[0]}, ${d.arrivee[1]} ${d.arrivee[2]}`, d.arrivee[3], d.arrivee[4]],
    );

    // Les visites : celle à venir (un créneau libre du commercial), et celles déjà faites.
    if (d.visite) {
      const date = jour(d.visite.dans);
      let debut = null;
      for (const h of ["10:00", "14:00", "16:30", "11:30", "09:00"]) {
        const t = instantParis(date, h);
        const pris = await un(
          `select 1 as x from crm.rendez_vous where commercial_id = $1 and not coalesce(journee, false)
             and debut < $3 and debut + make_interval(mins => duree_min) > $2 limit 1`,
          [commercial.id, t.toISOString(), new Date(t.getTime() + 75 * 60_000).toISOString()],
        );
        if (!pris) {
          debut = t;
          break;
        }
      }
      debut ??= instantParis(date, "18:00");
      await db.query(
        `insert into crm.rendez_vous(commercial_id, dossier_id, type, titre, lieu, debut, duree_min, notes, journee) values ($1,$2,$3,$4,$5,$6,60,$7,false)`,
        [commercial.id, dossier.id, d.visite.type, `Visite technique · ${d.client.prenom} ${d.client.nom}`, `${d.depart[1]} ${d.depart[2]}`, debut.toISOString(), MARQUE],
      );
      cree.visites++;
    }
    if (d.visitePassee) {
      await db.query(
        `insert into crm.rendez_vous(commercial_id, dossier_id, type, titre, lieu, debut, duree_min, notes, journee, termine, devis_etabli) values ($1,$2,'phys',$3,$4,$5,60,$6,false,true,true)`,
        [commercial.id, dossier.id, `Visite technique · ${d.client.prenom} ${d.client.nom}`, `${d.depart[1]} ${d.depart[2]}`, ilYa(d.visitePassee, "14:00").toISOString(), MARQUE],
      );
      cree.visites++;
    }

    // Le devis : saisi HT, en postes, TVA 20 % (src/crm/devis/modele.ts) ; envoyé, puis signé selon l'étape.
    if (!d.formule) continue;
    const base = arrondi(d.ht * 0.88);
    const lignes = [
      { id: "l1", groupe: "base", libelle: `Déménagement ${d.depart[2]} → ${d.arrivee[2]}, formule ${NOM_FORMULE[d.formule]}`, detail: `${d.volume} m³ · ${d.distance} km`, qte: 1, unite: "forfait", pu: base, tva: 20, charge: "bailly" },
      { id: "l2", groupe: "base", libelle: "Fournitures : cartons, adhésif, housses de protection", detail: "", qte: 1, unite: "lot", pu: arrondi(d.ht - base), tva: 20, charge: "bailly" },
    ];
    const tva = arrondi(d.ht * 0.2);
    const ttc = arrondi(d.ht + tva);
    const signe = d.signe != null;
    const devis = await un(
      `insert into crm.devis(dossier_id, numero, formule, lignes, montant, montant_ht, montant_tva, saisie, mode, statut, envoye_le, signe_le, validite, prestations,
          distance_km, commercial_id, date_devis, arrhes_pct, cree_le, maj_le)
       values ($1,$2,$3,$4,$5,$6,$7,'ht','postes',$8,$9,$10,$11,$12,$13,$14,$15,30,$16, now()) returning id, numero`,
      [dossier.id, DV(d.n), d.formule, JSON.stringify(lignes), ttc, d.ht, tva, signe ? "signe" : "envoye", ilYa(d.envoye), signe ? ilYa(d.signe, "18:10") : null,
        jour(-d.envoye + 60), JSON.stringify(prestationsPour(d.formule)), d.distance, commercial.id, jour(-d.envoye), ilYa(d.envoye + 1)],
    );
    cree.devis.push(`${devis.numero} ${NOM_FORMULE[d.formule]} ${ttc} € TTC${signe ? " signé" : " envoyé"}`);

    // Les factures : arrhes de 30 % (réglées), puis le solde (déduction des arrhes), comme src/crm/facturation les émet.
    const fige = payeurFige(payeur ?? salarie);
    let acompte = null;
    if (d.acompte) {
      const htA = arrondi(d.ht * 0.3);
      const tvaA = arrondi(htA * 0.2);
      const date = auPlusTard(jour(-d.acompte.emise));
      acompte = await un(
        `insert into crm.factures(dossier_id, numero, objet, montant, montant_ht, montant_tva, statut, emise_le, echeance_le, genre, devis_id, date_mode, origine_client_id, payeur_client_id, payeur, cree_le)
         values ($1,$2,$3,$4,$5,$6,'emise',$7,$7,'acompte',$8,'libre',$9,$10,$11,$12) returning id, numero, montant::float8 as montant`,
        [dossier.id, FA(cree.factures.length + 1), "Arrhes de 30 % sur le devis signé", arrondi(htA + tvaA), htA, tvaA, date, devis.id, salarie.id, payeur?.id ?? null, JSON.stringify(fige), instantParis(date, "09:15")],
      );
      await db.query(
        `insert into crm.factures_lignes(facture_id, ordre, genre, libelle, detail, quantite, unite, prix_unitaire_ht, taux_tva, montant_ht, montant_tva, montant_ttc)
         values ($1,0,'prestation',$2,$3,1,'forfait',$4,20,$4,$5,$6)`,
        [acompte.id, `Arrhes de 30 % · devis ${devis.numero}`, `Déménagement ${d.depart[2]} → ${d.arrivee[2]}`, htA, tvaA, acompte.montant],
      );
      cree.factures.push(`${acompte.numero} arrhes ${acompte.montant} € TTC, réglée`);
      // Le règlement affecté : le déclencheur du CRM (crm.reglement_apres) passe la facture à « payée ».
      await db.query(
        `insert into crm.paiements(dossier_id, libelle, montant, recu_le, mode, nature, facture_id, commentaire, cree_le) values ($1,$2,$3,$4,'virement','arrhes',$5,$6,$7)`,
        [dossier.id, `Arrhes · facture ${acompte.numero}`, acompte.montant, auPlusTard(jour(-d.acompte.regle)), acompte.id, MARQUE, ilYa(d.acompte.regle, "11:00")],
      );
      cree.reglements++;
    }
    if (d.solde) {
      const date = auPlusTard(jour(-d.solde.emise));
      const htA = acompte ? arrondi(d.ht * 0.3) : 0;
      const tvaA = arrondi(htA * 0.2);
      const montant = arrondi(ttc - (acompte?.montant ?? 0));
      const f = await un(
        `insert into crm.factures(dossier_id, numero, objet, montant, montant_ht, montant_tva, statut, emise_le, echeance_le, genre, devis_id, date_mode, origine_client_id, payeur_client_id, payeur, cree_le)
         values ($1,$2,$3,$4,$5,$6,'emise',$7,$8,'solde',$9,'libre',$10,$11,$12,$13) returning id, numero, montant::float8 as montant`,
        [dossier.id, FA(cree.factures.length + 1), "Solde du déménagement", montant, arrondi(d.ht - htA), arrondi(tva - tvaA), date, jour(-d.solde.echeance), devis.id, salarie.id, payeur?.id ?? null, JSON.stringify(fige), instantParis(date, "09:30")],
      );
      await db.query(
        `insert into crm.factures_lignes(facture_id, ordre, genre, libelle, detail, quantite, unite, prix_unitaire_ht, taux_tva, montant_ht, montant_tva, montant_ttc)
         values ($1,0,'prestation',$2,$3,1,'forfait',$4,20,$4,$5,$6)`,
        [f.id, `Déménagement ${d.depart[2]} → ${d.arrivee[2]}, formule ${NOM_FORMULE[d.formule]}`, `Devis ${devis.numero} · ${d.volume} m³`, d.ht, tva, ttc],
      );
      if (acompte)
        await db.query(
          `insert into crm.factures_lignes(facture_id, ordre, genre, libelle, quantite, prix_unitaire_ht, taux_tva, montant_ht, montant_tva, montant_ttc, facture_deduite_id)
           values ($1,1,'deduction',$2,1,$3,20,$3,$4,$5,$6)`,
          [f.id, `Déduction de la facture d'arrhes ${acompte.numero}`, -htA, -tvaA, -acompte.montant, acompte.id],
        );
      cree.factures.push(`${f.numero} solde ${f.montant} € TTC, échue le ${jour(-d.solde.echeance)}, non réglée`);
    }
  }

  /* Les demandes de l'espace pro Carrefour, comme le formulaire les écrit (src/lib/requests.ts, createRequest). */
  for (const r of DEMANDES) {
    const creeLe = ilYa(r.cree, r.cree === 0 ? "08:40" : "19:20");
    const lieu = (a) => ({ adresse: a.adresse, code_postal: a.cp, ville: a.ville, etage: a.etage, ascenseur: a.ascenseur, surface: a.surface });
    const charge = {
      client: { nom: r.nom, tel: r.tel, email: EMAIL(r.local) },
      depart: lieu(r.depart),
      arrivee: lieu(r.arrivee),
      volume: { method: "explicit", volume_m3: r.volume },
      details: { demenagement: "complet" },
      formule: r.formule,
      services: { demontage: true, montage: true, emballage: r.formule !== "eco", garde_meuble: false, monte_meuble: false },
      assurance: "standard",
      distance_km: r.distance,
      type_client: "particulier",
      date_souhaitee: jour(r.date),
      valeur_mobilier: "10 000 – 30 000 €",
      espace,
      mutation_pro: true,
      societe: espace.nom,
      demo_rh: ETIQUETTE,
    };
    const ttc = r.ht ? arrondi(r.ht * 1.2) : null;
    const demande = await un(
      `insert into public.requests(source, status, client_nom, client_email, client_tel, depart_adresse, depart_code_postal, depart_ville, depart_etage, depart_ascenseur, type_logement_depart,
          arrivee_adresse, arrivee_code_postal, arrivee_ville, arrivee_etage, arrivee_ascenseur, type_logement_arrivee, date_souhaitee, formule, distance_km, services,
          volume_m3, volume_method, estimation_prix, score_potentiel, score_difficulte, raw_payload, created_at, updated_at)
       values ('form',$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,'explicit',$22,$23,$24,$25,$26,$26) returning id`,
      [r.statut, r.nom, EMAIL(r.local), r.tel, r.depart.adresse, r.depart.cp, r.depart.ville, r.depart.etage, r.depart.ascenseur, r.depart.type,
        r.arrivee.adresse, r.arrivee.cp, r.arrivee.ville, r.arrivee.etage, r.arrivee.ascenseur, r.arrivee.type, jour(r.date), r.formule, r.distance, JSON.stringify(charge.services),
        r.volume, ttc, r.score ?? null, r.difficulte ?? null, JSON.stringify(charge), creeLe.toISOString()],
    );
    cree.demandes.push(`${r.nom} ${r.depart.ville} → ${r.arrivee.ville} (${r.statut === "new" ? "Demande reçue" : "Estimée"})`);
    await db.query("insert into public.request_events(request_id, type, payload, created_at) values ($1,'created',$2,$3)", [demande.id, JSON.stringify({ source: "form" }), creeLe.toISOString()]);
    if (!r.ht) continue;

    // L'estimation du site (public.devis) et l'analyse notée : ce que la qualification écrit.
    const ht = r.ht;
    const transport = arrondi(ht * 0.86);
    const estimation = await un(
      `insert into public.devis(reference, request_id, client_nom, client_email, montant_ht, montant_tva, montant_ttc, lignes, status, valid_until, created_at, updated_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,'brouillon',$9,$10,$10) returning id, reference`,
      [DEV(r.n), demande.id, r.nom, EMAIL(r.local), ht, arrondi(ht * 0.2), ttc,
        JSON.stringify([
          { label: "Transport et manutention", amount: transport, detail: `${r.volume} m³ · ${r.distance} km` },
          { label: "Emballage et fournitures", amount: arrondi(ht - transport), detail: `formule ${r.formule === "luxe" ? "Premium" : r.formule === "eco" ? "Économique" : "Standard"}` },
        ]),
        jour(-r.cree + 30), new Date(creeLe.getTime() + 2000).toISOString()],
    );
    cree.estimations.push(`${estimation.reference} ${ttc} € TTC`);
    await db.query("insert into public.request_events(request_id, type, payload, created_at) values ($1,'analysis',$2,$3)", [
      demande.id,
      JSON.stringify({
        score: r.score,
        difficulte: r.difficulte,
        lines: [
          { key: "valeur", note: Math.min(100, Math.round(ttc / 80)), label: "Valeur du devis", poids: 25, detail: `${ttc} € TTC`, contribution: Math.round(Math.min(100, ttc / 80) * 0.25) },
          { key: "volume", note: Math.min(100, r.volume * 2), label: "Volume à déménager", poids: 15, detail: `${r.volume} m³`, contribution: Math.round(Math.min(100, r.volume * 2) * 0.15) },
          { key: "distance", note: Math.min(100, Math.round(r.distance / 6)), label: "Distance", poids: 10, detail: `${r.distance} km`, contribution: Math.round(Math.min(100, r.distance / 6) * 0.1) },
        ],
      }),
      new Date(creeLe.getTime() + 3000).toISOString(),
    ]);
    if (r.rappel) {
      // Le rappel demandé : une ligne « rappel » de l'historique, comme src/lib/rappels.ts (creerRappel) l'écrit.
      await db.query("insert into public.request_events(request_id, type, payload, created_at) values ($1,'rappel',$2,$3)", [
        demande.id,
        JSON.stringify({ statut: "a_rappeler", priorite: r.score, montant_ttc: ttc, devis_id: estimation.id, creneau: r.rappel, note: null }),
        new Date(creeLe.getTime() + 60_000).toISOString(),
      ]);
      cree.rappels++;
    }
  }
  return { ...cree, commercial: commercial.nom };
}

/* ─────────────── Lancer ─────────────── */

const db = new pg.Client({
  connectionString: env.DATABASE_URL,
  ssl: /localhost|127\.0\.0\.1/.test(env.DATABASE_URL) ? false : { rejectUnauthorized: false },
  application_name: "bailly-demo-rh-carrefour",
});

try {
  await db.connect();
  // La colonne du rattachement vient du schéma du CRM (posé au démarrage de l'app interne).
  const colonne = await db.query("select 1 from information_schema.columns where table_schema = 'crm' and table_name = 'clients' and column_name = 'espace_pro_id'");
  if (!colonne.rowCount) throw new Error("crm.clients.espace_pro_id manque : démarrez une fois l'app interne (elle pose le schéma du CRM), puis relancez.");
  const espace = mode === "creer" ? await espaceCarrefour() : null;
  await db.query("begin");
  const retire = await retirer(db);
  const pose = espace ? await poser(db, espace) : null;
  await db.query("commit");
  const total = Object.values(retire).reduce((a, b) => a + b, 0);
  console.log(total ? `Retiré : ${Object.entries(retire).filter(([, v]) => v).map(([k, v]) => `${v} ${k}`).join(", ")}` : "Rien à retirer.");
  if (pose) {
    console.log(`Posé sur l'espace pro « ${espace.nom} » (${espace.id}) — commercial : ${pose.commercial}`);
    console.log(`  ${pose.clients} clients du CRM, ${pose.dossiers.length} dossiers, ${pose.devis.length} devis, ${pose.factures.length} factures, ${pose.reglements} règlements, ${pose.visites} visites`);
    for (const x of pose.dossiers) console.log(`    · ${x}`);
    for (const x of pose.devis) console.log(`    · ${x}`);
    for (const x of pose.factures) console.log(`    · ${x}`);
    console.log(`  ${pose.demandes.length} demandes de l'espace pro, ${pose.estimations.length} estimations, ${pose.rappels} rappel`);
    for (const x of pose.demandes) console.log(`    · ${x}`);
  }
} catch (e) {
  await db.query("rollback").catch(() => {});
  console.error("Échec :", e instanceof Error ? e.message : e);
  process.exitCode = 1;
} finally {
  await db.end().catch(() => {});
}
