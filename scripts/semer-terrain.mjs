#!/usr/bin/env node
/*
 * Sème le jeu de démonstration de l'outil terrain des déménageurs.
 *
 *   node scripts/semer-terrain.mjs            sème deux déménageurs fictifs et quelques photos
 *   node scripts/semer-terrain.mjs --retirer  retire tout le jeu fictif, comptes compris
 *
 * Les deux comptes sont des comptes Supabase Auth en @example.com, marqués
 * app_metadata = { role: "terrain", demo: true }, et leurs lignes
 * crm.agents_terrain portent demo = true. Leur mot de passe provisoire est tiré
 * au hasard et affiché une seule fois, ici : il n'est écrit nulle part (la page
 * Déménageurs du CRM sait en tirer un autre).
 *
 * Les photos sont des images dessinées par ce script (des formes simples :
 * cartons, meubles protégés, parquet), marquées « DEMO » : aucune vraie photo,
 * aucune personne. Elles vont dans le seau privé « photos-chantier », et leurs
 * lignes crm.photos_chantier portent demo = true. Elles se rattachent à deux
 * dossiers du jeu du CRM (BD-2026-0301 et BD-2026-0421), ou à défaut aux deux
 * premiers dossiers qui ont une lettre de voiture.
 *
 * Garde-fous : le script ne touche qu'à ses propres lignes (demo = true) et à
 * ses comptes (@example.com, role terrain, demo). Une adresse du jeu déjà prise
 * par un autre compte arrête tout, sans rien modifier. Les tables doivent
 * exister : l'app interne les pose à son démarrage (src/crm/lib/schema.ts).
 *
 * Variables : DATABASE_URL, NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY,
 * prises dans l'environnement ou dans .env.local à la racine du dépôt.
 */

import { randomInt } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";
import { createClient } from "@supabase/supabase-js";
import pg from "pg";

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const options = new Set(process.argv.slice(2));
if (!process.env.SUPABASE_SERVICE_ROLE_KEY && existsSync(path.join(RACINE, ".env.local"))) process.loadEnvFile(path.join(RACINE, ".env.local"));
const { DATABASE_URL, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!DATABASE_URL || !NEXT_PUBLIC_SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("DATABASE_URL, NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont nécessaires (environnement ou .env.local).");
  process.exit(1);
}

const SEAU = "photos-chantier";
const supabase = createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const base = new pg.Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

const AGENTS = [
  { identifiant: "demo.leo", email: "leo.demo@example.com", prenom: "Léo", nom: "Démo", equipe: "Équipe 1", interimaire: false },
  { identifiant: "demo.ines", email: "ines.demo@example.com", prenom: "Inès", nom: "Démo", equipe: null, interimaire: true },
];

/* Les photos : clé fixe (le script se rejoue sans doubler), dossier (0 ou 1), auteur, scène, décalage dans le temps. */
const PHOTOS = [
  { cle: "6f1d0c2a-0d6e-4c51-9a8e-1f0000000001", dossier: 0, agent: 0, categorie: "avant", scene: "salon", minutes: -95 },
  { cle: "6f1d0c2a-0d6e-4c51-9a8e-1f0000000002", dossier: 0, agent: 0, categorie: "avant", scene: "armoire", minutes: -93 },
  { cle: "6f1d0c2a-0d6e-4c51-9a8e-1f0000000003", dossier: 0, agent: 0, categorie: "detail", scene: "parquet", minutes: -90, note: "Photo de démonstration : image dessinée, pas une vraie prise de vue." },
  { cle: "6f1d0c2a-0d6e-4c51-9a8e-1f0000000004", dossier: 0, agent: 1, categorie: "avant", scene: "couloir", minutes: -88 },
  { cle: "6f1d0c2a-0d6e-4c51-9a8e-1f0000000005", dossier: 1, agent: 1, categorie: "apres", scene: "vide", jour: true },
  { cle: "6f1d0c2a-0d6e-4c51-9a8e-1f0000000006", dossier: 1, agent: 1, categorie: "apres", scene: "arrivee", jour: true },
];
const POSITIONS = [
  { lat: 48.8412, lng: 2.3876, precision: 18 },
  { lat: 48.3904, lng: -4.4861, precision: 25 },
];

function motDePasse() {
  const A = "abcdefghjkmnpqrstuvwxyz23456789";
  const bloc = () => Array.from({ length: 4 }, () => A[randomInt(A.length)]).join("");
  return `${bloc()}-${bloc()}-${bloc()}`;
}

async function tousLesComptes() {
  const comptes = [];
  for (let page = 1; ; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`Lecture des comptes impossible : ${error.message}`);
    comptes.push(...data.users);
    if (data.users.length < 1000) return comptes;
  }
}

const estCompteDuJeu = (u) => u.app_metadata?.role === "terrain" && u.app_metadata?.demo === true && u.email?.endsWith("@example.com");

// ─────────────── Le dessin : un petit PNG, sans dépendance ───────────────

const CRC = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
const crc32 = (b) => {
  let c = -1;
  for (const x of b) c = CRC[(c ^ x) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
};
function png(L, H, px) {
  const morceau = (type, donnees) => {
    const t = Buffer.from(type, "ascii");
    const lg = Buffer.alloc(4);
    lg.writeUInt32BE(donnees.length);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc32(Buffer.concat([t, donnees])));
    return Buffer.concat([lg, t, donnees, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(L, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8;
  ihdr[9] = 2; // RVB
  const brut = Buffer.alloc((L * 3 + 1) * H);
  for (let y = 0; y < H; y++) px.copy(brut, y * (L * 3 + 1) + 1, y * L * 3, (y + 1) * L * 3);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), morceau("IHDR", ihdr), morceau("IDAT", deflateSync(brut, { level: 9 })), morceau("IEND", Buffer.alloc(0))]);
}

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

/** Une toile de 1600 × 1200 « logiques », dessinée à l'échelle voulue. */
function toile(L) {
  const H = Math.round((L * 3) / 4);
  const k = L / 1600;
  const px = Buffer.alloc(L * H * 3);
  const point = (x, y, c) => {
    if (x < 0 || y < 0 || x >= L || y >= H) return;
    const i = (y * L + x) * 3;
    px[i] = c[0];
    px[i + 1] = c[1];
    px[i + 2] = c[2];
  };
  const t = {
    L,
    H,
    rect(x, y, w, h, couleur) {
      const c = hex(couleur);
      const x0 = Math.round(x * k), y0 = Math.round(y * k), x1 = Math.round((x + w) * k), y1 = Math.round((y + h) * k);
      for (let yy = Math.max(0, y0); yy < Math.min(H, y1); yy++) for (let xx = Math.max(0, x0); xx < Math.min(L, x1); xx++) point(xx, yy, c);
    },
    ovale(cx, cy, rx, ry, couleur, anneau = 0) {
      const c = hex(couleur);
      const X = cx * k, Y = cy * k, RX = rx * k, RY = ry * k, E = anneau * k;
      for (let yy = Math.floor(Y - RY); yy <= Y + RY; yy++)
        for (let xx = Math.floor(X - RX); xx <= X + RX; xx++) {
          const d = ((xx - X) / RX) ** 2 + ((yy - Y) / RY) ** 2;
          const dIn = E ? ((xx - X) / Math.max(1, RX - E)) ** 2 + ((yy - Y) / Math.max(1, RY - E)) ** 2 : 2;
          if (d <= 1 && dIn > 1) point(xx, yy, c);
        }
    },
    trait(xa, ya, xb, yb, ep, couleur) {
      const c = hex(couleur);
      const n = Math.ceil(Math.hypot(xb - xa, yb - ya) * k);
      const r = Math.max(0.5, (ep * k) / 2);
      for (let i = 0; i <= n; i++) {
        const x = (xa + ((xb - xa) * i) / n) * k, y = (ya + ((yb - ya) * i) / n) * k;
        for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (dx * dx + dy * dy <= r * r) point(Math.round(x + dx), Math.round(y + dy), c);
      }
    },
    texte(chaine, x, y, taille, couleur) {
      const pas = taille / 7;
      let cx = x;
      for (const ch of chaine) {
        const g = GLYPHES[ch] ?? GLYPHES[" "];
        g.forEach((ligne, j) => [...ligne].forEach((b, i) => b === "1" && t.rect(cx + i * pas, y + j * pas, pas + 0.5, pas + 0.5, couleur)));
        cx += 6 * pas;
      }
    },
    fin: () => png(L, H, px),
  };
  return t;
}

/* Une police de 5 × 7, juste les lettres utiles. */
const GLYPHES = {
  " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  D: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  I: ["01110", "00100", "00100", "00100", "00100", "00100", "01110"],
  L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  N: ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  V: ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
};

function piece(t, mur, sol) {
  t.rect(0, 0, 1600, 760, mur);
  t.rect(0, 760, 1600, 440, sol);
  for (let x = -200; x < 1800; x += 180) t.trait(x, 760, x - 160, 1200, 3, "#a88560");
  t.rect(0, 748, 1600, 14, "#f4f1ea");
}
function carton(t, x, y, w, h) {
  t.rect(x, y, w, h, "#c9935a");
  t.rect(x, y, w, 10, "#b07d48");
  t.rect(x + w / 2 - 22, y, 44, h, "#e8c58f");
  t.rect(x + 18, y + h - 70, 90, 46, "#f6efe2");
}
function marque(t, mot) {
  t.rect(40, 40, 70 + mot.length * 54, 110, "#15122a");
  t.texte(mot, 75, 68, 56, "#ffffff");
  t.rect(1260, 1060, 300, 100, "#fcd34d");
  t.texte("DEMO", 1302, 1083, 56, "#15122a");
}

const SCENES = {
  salon(t) {
    piece(t, "#e8e2d6", "#c8a27a");
    t.rect(1080, 140, 360, 300, "#bcd7ea");
    t.rect(1250, 140, 16, 300, "#f4f1ea");
    t.rect(1080, 282, 360, 16, "#f4f1ea");
    t.rect(140, 560, 620, 260, "#8fa3b8");
    t.rect(110, 520, 680, 90, "#7a8fa6");
    carton(t, 880, 620, 300, 230);
    carton(t, 1200, 620, 260, 230);
    carton(t, 960, 400, 300, 220);
    marque(t, "AVANT");
  },
  armoire(t) {
    piece(t, "#ebe6dc", "#c49d75");
    t.rect(420, 150, 560, 760, "#5b6b8c");
    for (let y = 180; y < 860; y += 60) t.trait(430, y, 970, y + 40, 10, "#6f80a3");
    t.rect(420, 380, 560, 26, "#d9c27a");
    t.rect(420, 700, 560, 26, "#d9c27a");
    carton(t, 1080, 640, 280, 220);
    marque(t, "AVANT");
  },
  parquet(t) {
    t.rect(0, 0, 1600, 1200, "#c99f71");
    for (let y = 0; y < 1200; y += 150) {
      t.rect(0, y, 1600, 6, "#a47a4f");
      for (let x = ((y / 150) % 2) * 260; x < 1600; x += 520) t.rect(x, y, 6, 150, "#a47a4f");
    }
    t.trait(520, 700, 1060, 520, 7, "#6b4a2c");
    t.trait(560, 720, 1040, 556, 3, "#e4c9a6");
    t.ovale(790, 620, 330, 200, "#dc2626", 14);
    marque(t, "DETAIL");
  },
  couloir(t) {
    piece(t, "#e5e0d5", "#bfa07f");
    t.rect(620, 140, 360, 620, "#8a6a4a");
    t.rect(650, 170, 300, 590, "#a9845f");
    t.ovale(915, 470, 16, 16, "#e0c070");
    t.rect(300, 800, 1000, 400, "#7d7d86");
    for (let x = 300; x < 1300; x += 100) t.rect(x, 800, 4, 400, "#6c6c75");
    marque(t, "AVANT");
  },
  vide(t) {
    piece(t, "#efebe3", "#cfab83");
    t.rect(560, 150, 480, 380, "#cfe4f2");
    t.rect(792, 150, 16, 380, "#f6f3ec");
    t.rect(560, 332, 480, 16, "#f6f3ec");
    t.rect(540, 530, 520, 22, "#f6f3ec");
    marque(t, "APRES");
  },
  arrivee(t) {
    piece(t, "#e9efe9", "#c7a37d");
    t.rect(140, 150, 380, 330, "#cfe4f2");
    t.rect(322, 150, 16, 330, "#f6f3ec");
    carton(t, 700, 600, 320, 240);
    carton(t, 1040, 600, 300, 240);
    carton(t, 860, 380, 320, 220);
    t.rect(120, 620, 460, 260, "#9aa87f");
    marque(t, "APRES");
  },
};

function dessiner(scene, L) {
  const t = toile(L);
  SCENES[scene](t);
  return t.fin();
}

// ─────────────── Le jeu ───────────────

async function assurerSeau() {
  const { data } = await supabase.storage.getBucket(SEAU);
  if (data) return;
  const { error } = await supabase.storage.createBucket(SEAU, {
    public: false,
    fileSizeLimit: 15 * 1024 * 1024,
    allowedMimeTypes: ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"],
  });
  if (error && !/exist/i.test(error.message)) throw new Error(`Création du seau impossible : ${error.message}`);
}

async function dossiersDuJeu() {
  const { rows } = await base.query("select id, ref from crm.dossiers where ref = any($1) order by array_position($1, ref)", [["BD-2026-0301", "BD-2026-0421"]]);
  if (rows.length === 2) return rows;
  const r = await base.query("select distinct on (d.id) d.id, d.ref from crm.dossiers d join crm.lettres_voiture l on l.dossier_id = d.id order by d.id limit 2");
  if (r.rows.length < 2) throw new Error("Il faut au moins deux dossiers avec une lettre de voiture dans le CRM.");
  return r.rows;
}

async function semer() {
  await assurerSeau();
  const comptes = await tousLesComptes();
  const ids = [];
  for (const a of AGENTS) {
    const ligne = (await base.query("select id, auth_id, demo from crm.agents_terrain where identifiant = $1", [a.identifiant])).rows[0];
    if (ligne) {
      if (!ligne.demo) throw new Error(`L'identifiant ${a.identifiant} est pris par un vrai compte : rien n'est modifié.`);
      console.log(`  ${a.identifiant} : déjà là (mot de passe inchangé)`);
      ids.push(ligne.id);
      continue;
    }
    const existant = comptes.find((u) => u.email?.toLowerCase() === a.email);
    if (existant && !estCompteDuJeu(existant)) throw new Error(`L'adresse ${a.email} est prise par un autre compte : rien n'est modifié.`);
    const mdp = motDePasse();
    let authId = existant?.id;
    if (existant) {
      const { error } = await supabase.auth.admin.updateUserById(existant.id, { password: mdp, ban_duration: "none" });
      if (error) throw new Error(error.message);
    } else {
      const { data, error } = await supabase.auth.admin.createUser({
        email: a.email,
        password: mdp,
        email_confirm: true,
        app_metadata: { role: "terrain", demo: true },
        user_metadata: { nom: `${a.prenom} ${a.nom}` },
      });
      if (error) throw new Error(`Compte ${a.email} : ${error.message}`);
      authId = data.user.id;
    }
    const r = await base.query(
      `insert into crm.agents_terrain (auth_id, identifiant, email, prenom, nom, equipe, interimaire, demo, cree_par)
       values ($1,$2,$3,$4,$5,$6,$7,true,'Jeu de démonstration') returning id`,
      [authId, a.identifiant, a.email, a.prenom, a.nom, a.equipe, a.interimaire],
    );
    ids.push(r.rows[0].id);
    console.log(`  ${a.identifiant} : créé — mot de passe provisoire ${mdp} (affiché une seule fois)`);
  }

  const dossiers = await dossiersDuJeu();
  const dateB = (await base.query("select coalesce(max(date_livraison), max(date_chargement))::text as j from crm.lettres_voiture where dossier_id = $1", [dossiers[1].id])).rows[0]?.j;
  let n = 0;
  for (const p of PHOTOS) {
    if ((await base.query("select 1 from crm.photos_chantier where cle = $1", [p.cle])).rowCount) continue;
    const d = dossiers[p.dossier];
    const a = AGENTS[p.agent];
    const prise = p.jour && dateB ? new Date(`${dateB}T15:${String(40 + n).padStart(2, "0")}:00+01:00`) : new Date(Date.now() + p.minutes * 60_000);
    const jour = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Paris" }).format(prise);
    const chemin = `dossiers/${d.id}/${jour}/${p.cle}.png`;
    const cheminV = `dossiers/${d.id}/${jour}/${p.cle}-v.png`;
    const grande = dessiner(p.scene, 1600);
    const petite = dessiner(p.scene, 480);
    for (const [c, o] of [[chemin, grande], [cheminV, petite]]) {
      const { error } = await supabase.storage.from(SEAU).upload(c, o, { contentType: "image/png", upsert: true });
      if (error) throw new Error(`Dépôt ${c} : ${error.message}`);
    }
    const pos = POSITIONS[p.dossier];
    await base.query(
      `insert into crm.photos_chantier (cle, dossier_id, agent_id, auteur, equipe, categorie, note, prise_le, prise_appareil,
         latitude, longitude, precision_m, chemin, chemin_vignette, type, taille, largeur, hauteur, demo)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$8,$9,$10,$11,$12,$13,'image/png',$14,1600,1200,true) on conflict (cle) do nothing`,
      [p.cle, d.id, ids[p.agent], `${a.prenom} ${a.nom}`, a.equipe, p.categorie, p.note ?? null, prise, pos.lat, pos.lng, pos.precision, chemin, cheminV, grande.length],
    );
    n++;
  }
  console.log(`  ${n} photo${n > 1 ? "s" : ""} ajoutée${n > 1 ? "s" : ""} (dossiers ${dossiers.map((d) => d.ref).join(", ")})`);
}

async function retirer() {
  const photos = (await base.query("select chemin, chemin_vignette from crm.photos_chantier where demo")).rows;
  const fichiers = photos.flatMap((p) => [p.chemin, p.chemin_vignette]).filter(Boolean);
  if (fichiers.length) await supabase.storage.from(SEAU).remove(fichiers);
  const r1 = await base.query("delete from crm.photos_chantier where demo");
  const agents = (await base.query("select id, auth_id, email from crm.agents_terrain where demo")).rows;
  const comptes = await tousLesComptes();
  for (const a of agents) {
    const u = comptes.find((x) => x.id === a.auth_id);
    if (u && estCompteDuJeu(u)) await supabase.auth.admin.deleteUser(u.id);
  }
  // Les photos de vrais comptes ne sont pas touchées : seules partent celles du jeu, et les comptes du jeu.
  const r2 = await base.query("delete from crm.agents_terrain where demo and not exists (select 1 from crm.photos_chantier p where p.agent_id = agents_terrain.id)");
  console.log(`  ${r1.rowCount} photo(s) et ${r2.rowCount} compte(s) de démonstration retirés`);
}

try {
  await base.connect();
  const ok = (await base.query("select to_regclass('crm.agents_terrain') is not null and to_regclass('crm.photos_chantier') is not null as ok")).rows[0].ok;
  if (!ok) throw new Error("Les tables de l'outil terrain n'existent pas encore : démarrez l'app interne une fois (elle pose le schéma), puis relancez.");
  console.log(options.has("--retirer") ? "Retrait du jeu de démonstration de l'outil terrain…" : "Jeu de démonstration de l'outil terrain…");
  if (options.has("--retirer")) await retirer();
  else await semer();
} catch (e) {
  console.error(`Arrêt : ${e.message}`);
  process.exitCode = 1;
} finally {
  await base.end();
}
