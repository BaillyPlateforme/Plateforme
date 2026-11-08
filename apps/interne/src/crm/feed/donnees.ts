import "server-only";
import { q, q1 } from "@/crm/lib/db";
import { eur, initiales, m3, nomClient } from "@/crm/lib/format";
import { MODELES_MESSAGE } from "@/lib/espace-client/libelles";
import type { NomIcone } from "@/ui/icones";
import { COLONNES, GENRES, SOURCES, requeteComptes, requetePage, type Cote, type Curseur, type Filtres, type Genre } from "./sources";
import { habillageActivite, issueEnvoi, phraseDe, type Ton } from "./phrases";
import { suiviDesEnvois } from "@/crm/suivi/donnees";
import { etapesPiste, libellePage, MESURE_INDICATIVE } from "@/crm/suivi/etapes";

/*
 * Le Feed : la lecture. Les filtres de l'adresse deviennent des Filtres
 * (sources.ts), la page se lit en une requête, puis les dossiers, demandes,
 * espaces et auteurs qu'elle cite en une seconde, et chaque ligne devient un
 * Evenement prêt à afficher (phrase, auteur, jour, heure, liens).
 */

export type Vue = "tout" | "client" | "staff";
export const PERIODES = [
  { valeur: "jour", libelle: "Aujourd’hui" },
  { valeur: "7", libelle: "7 derniers jours" },
  { valeur: "30", libelle: "30 derniers jours" },
  { valeur: "90", libelle: "90 derniers jours" },
  { valeur: "365", libelle: "12 derniers mois" },
];
/** Les événements d'une page, et d'une suite. */
export const PAR_PAGE = 40;

/** Les paramètres de l'adresse, vérifiés : ce que la page et l'action « Voir plus » se passent. */
export interface ParamsFeed {
  vue: Vue;
  periode: string | null;
  type: Genre | null;
  par: string | null;
  objet: string | null;
  q: string | null;
  /** « demandes » : le fil des seules demandes du site (Demandes › Feed). */
  portee: "demandes" | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function paramsDe(sp: Record<string, string | string[] | undefined>): ParamsFeed {
  const v = (k: string) => {
    const x = sp[k];
    return (Array.isArray(x) ? x[0] : x)?.trim() || null;
  };
  const vue = v("vue");
  const objet = v("objet");
  const par = v("par")?.toLowerCase() ?? null;
  return {
    vue: vue === "client" || vue === "staff" ? vue : "tout",
    periode: PERIODES.some((p) => p.valeur === v("periode")) ? v("periode") : null,
    type: GENRES.some((g) => g.cle === v("type")) ? (v("type") as Genre) : null,
    par: par && (par === "auto" || /^[^@\s]+@[^@\s]+$/.test(par)) ? par : null,
    objet: objet && (/^[dc]\d{1,9}$/.test(objet) || (objet.startsWith("r") && UUID.test(objet.slice(1)))) ? objet : null,
    q: v("q")?.slice(0, 80) ?? null,
    portee: v("portee") === "demandes" ? "demandes" : null,
  };
}

/** Minuit, heure de Paris, en ISO. */
function minuitParis(jour: string): string {
  // L'écart de Paris à cette date (+01:00 ou +02:00), lu par Intl.
  const midi = new Date(`${jour}T12:00:00Z`);
  const decalage = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Paris", timeZoneName: "longOffset" }).formatToParts(midi).find((p) => p.type === "timeZoneName")?.value ?? "GMT+01:00";
  return `${jour}T00:00:00${decalage.replace("GMT", "") || "+00:00"}`;
}

export const jourParis = (d: Date = new Date()) => d.toLocaleDateString("en-CA", { timeZone: "Europe/Paris" });

/** Le dossier ou la demande choisis, dans les trois mondes : le dossier du CRM, sa demande du site, son espace client. */
async function resoudreObjet(objet: string): Promise<{ filtre: NonNullable<Filtres["objet"]>; libelle: string } | null> {
  // Un client du CRM (c<id>, l'historique de sa fiche /clients/<id>) : ses dossiers, leurs demandes et
  // leurs espaces, et les demandes du site envoyées depuis son e-mail.
  if (objet.startsWith("c")) {
    const r = await q1<{ societe: string | null; prenom: string | null; nom: string | null; dossiers: number[]; demandes: string[]; espaces: string[] }>(
      `select c.societe, c.prenom, c.nom,
              coalesce((select array_agg(d.id) from crm.dossiers d where d.client_id = c.id), '{}') as dossiers,
              coalesce((select array_agg(distinct r.id::text) from public.requests r
                         where r.id in (select d.request_id from crm.dossiers d where d.client_id = c.id)
                            or (nullif(trim(c.email), '') is not null and lower(trim(r.client_email)) = lower(trim(c.email)))), '{}') as demandes,
              coalesce((select array_agg(x.id::text) from public.ec_dossiers x join crm.dossiers d on d.id = x.crm_dossier_id where d.client_id = c.id), '{}') as espaces
         from crm.clients c where c.id = $1`,
      [Number(objet.slice(1))],
    );
    if (!r) return null;
    return { filtre: { dossiers: r.dossiers, demandes: r.demandes, espaces: r.espaces }, libelle: `Client · ${nomClient(r) || "sans nom"}` };
  }
  if (objet.startsWith("d")) {
    const id = Number(objet.slice(1));
    const r = await q1<{ ref: string; request_id: string | null; espaces: string[]; societe: string | null; prenom: string | null; nom: string | null }>(
      `select d.ref, d.request_id::text, c.societe, c.prenom, c.nom,
              coalesce((select array_agg(x.id::text) from public.ec_dossiers x where x.crm_dossier_id = d.id), '{}') as espaces
         from crm.dossiers d join crm.clients c on c.id = d.client_id where d.id = $1`,
      [id],
    );
    // Un dossier supprimé garde son fil : le journal des gestes le cite encore.
    if (!r) return { filtre: { dossiers: [id], demandes: [], espaces: [] }, libelle: `Dossier n° ${id} (supprimé)` };
    return { filtre: { dossiers: [id], demandes: r.request_id ? [r.request_id] : [], espaces: r.espaces }, libelle: `${r.ref} · ${nomClient(r)}` };
  }
  const id = objet.slice(1);
  const r = await q1<{ client_nom: string | null; dossiers: number[]; espaces: string[] }>(
    `select r.client_nom,
            coalesce((select array_agg(x.id) from crm.dossiers x where x.request_id = r.id), '{}') as dossiers,
            coalesce((select array_agg(x.id::text) from public.ec_dossiers x where x.request_id = r.id), '{}') as espaces
       from public.requests r where r.id = $1`,
    [id],
  );
  if (!r) return null;
  return { filtre: { dossiers: r.dossiers, demandes: [id], espaces: r.espaces }, libelle: `Demande de ${r.client_nom || "client inconnu"}` };
}

export async function filtresDe(p: ParamsFeed): Promise<{ filtres: Filtres; objetLibelle: string | null }> {
  const objet = p.objet ? await resoudreObjet(p.objet) : null;
  const depuis =
    p.periode === "jour" ? minuitParis(jourParis()) : p.periode ? new Date(Date.now() - Number(p.periode) * 86_400_000).toISOString() : null;
  return {
    filtres: {
      cote: p.vue === "tout" ? null : p.vue,
      depuis,
      genre: p.type,
      acteur: p.par,
      // Un objet introuvable ne montre rien plutôt que tout.
      objet: p.objet ? (objet?.filtre ?? { dossiers: [], demandes: [], espaces: [] }) : null,
      recherche: p.q,
      demandes: p.portee === "demandes",
    },
    objetLibelle: objet?.libelle ?? null,
  };
}

// ── Les événements ───────────────────────────────────────────────────────────────────────────

export interface Evenement {
  cle: string;
  src: string;
  id: string;
  quand: string;
  /** Le jour, à Paris (AAAA-MM-JJ), et son titre (« Aujourd'hui », « Hier », « jeudi 5 novembre »). */
  jour: string;
  jourLibelle: string;
  /** Sous « Aujourd'hui » et « Hier » : la date en toutes lettres. */
  jourSous: string | null;
  /** L'heure, à Paris ; rien quand la source ne garde qu'une date. */
  heure: string | null;
  cote: Cote;
  genre: Genre;
  icone: NomIcone;
  ton: Ton;
  texte: string;
  acteur: { type: "staff" | "client" | "auto"; nom: string; initiales: string };
  statut: { libelle: string; ton: Ton } | null;
  /** Le dossier, la demande ou l'espace client de l'événement. */
  contexte: { libelle: string; sous: string | null; href: string } | null;
  lien: { href: string; libelle: string } | null;
}

interface Ligne {
  src: string;
  id: string;
  quand: Date;
  sans_heure: boolean;
  cote: Cote;
  genres: Genre[];
  acteur_type: "staff" | "client" | "auto";
  acteur_email: string | null;
  acteur_nom: string | null;
  acteur_id: number | null;
  dossier_id: number | null;
  request_id: string | null;
  ec_dossier_id: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- les champs d'une ligne dépendent de sa source
  d: Record<string, any>;
}

interface Contextes {
  dossiers: { id: number; ref: string; societe: string | null; prenom: string | null; nom: string | null }[];
  demandes: { id: string; client_nom: string | null; depart: string | null; arrivee: string | null }[];
  espaces: { id: string; reference: string; crm: number | null; societe: string | null; prenom: string | null; nom: string | null; email: string | null }[];
  personnes: { email: string; nom: string | null }[];
}

/** Les dossiers, demandes, espaces et auteurs que cite une page, en une requête. */
async function contextes(lignes: Ligne[]): Promise<Contextes> {
  const dossiers = [...new Set(lignes.map((l) => l.dossier_id).filter((x): x is number => x != null))];
  const demandes = [...new Set(lignes.map((l) => l.request_id).filter((x): x is string => !!x))];
  const espaces = [...new Set(lignes.map((l) => l.ec_dossier_id).filter((x): x is string => !!x))];
  const emails = [...new Set(lignes.filter((l) => l.acteur_email && !l.acteur_nom).map((l) => l.acteur_email!))];
  const r = await q1<Contextes>(
    `select
       (select coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'ref', d.ref, 'societe', c.societe, 'prenom', c.prenom, 'nom', c.nom)), '[]')
          from crm.dossiers d join crm.clients c on c.id = d.client_id where d.id = any($1::int[])) as dossiers,
       (select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'client_nom', r.client_nom, 'depart', r.depart_ville, 'arrivee', r.arrivee_ville)), '[]')
          from public.requests r where r.id = any($2::uuid[])) as demandes,
       (select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'reference', x.reference, 'crm', x.crm_dossier_id, 'societe', c.societe, 'prenom', c.prenom,
                                                     'nom', c.nom, 'email', c.email)), '[]')
          from public.ec_dossiers x join public.ec_clients c on c.id = x.client_id where x.id = any($3::uuid[])) as espaces,
       (select coalesce(jsonb_agg(jsonb_build_object('email', p.email, 'nom', p.nom)), '[]') from (
          select distinct on (e) e as email, nom from (
            select lower(u.email) as e, u.nom, 1 as rang from crm.utilisateurs u where lower(u.email) = any($4::text[])
            union all
            select lower(m.email), m.nom, 2 from public.team_members m where lower(m.email) = any($4::text[]) and m.nom is not null
          ) t order by e, rang) p) as personnes`,
    [dossiers, demandes, espaces, emails],
  );
  return r ?? { dossiers: [], demandes: [], espaces: [], personnes: [] };
}

const HEURE = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });

const dateLongue = (jour: string) =>
  new Date(`${jour}T12:00:00Z`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

/** « Aujourd'hui », « Hier », « jeudi 5 novembre » (et l'année quand ce n'est pas celle-ci). */
export function libelleJour(jour: string, aujourdhui = jourParis()): string {
  if (jour === aujourdhui) return "Aujourd’hui";
  const hier = new Date(`${aujourdhui}T12:00:00Z`);
  hier.setUTCDate(hier.getUTCDate() - 1);
  if (jour === hier.toISOString().slice(0, 10)) return "Hier";
  const d = new Date(`${jour}T12:00:00Z`);
  const l = d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: jour.slice(0, 4) === aujourdhui.slice(0, 4) ? undefined : "numeric", timeZone: "UTC" });
  return l.charAt(0).toUpperCase() + l.slice(1);
}

/** Le nom d'un auteur : l'équipe sans nom connu reste « L'équipe », une tâche « Automatique ». */
function acteurDe(l: Ligne, personnes: Map<string, string | null>): Evenement["acteur"] {
  if (l.acteur_type === "auto") return { type: "auto", nom: "Automatique", initiales: "" };
  const nom =
    l.acteur_nom?.trim() ||
    (l.acteur_email ? personnes.get(l.acteur_email) || l.acteur_email : null) ||
    (l.acteur_type === "client" ? "Le client" : "L’équipe");
  // Un geste de l'équipe sans auteur connu (les plus anciens) : l'avatar de l'équipe, pas des initiales.
  if (nom === "L’équipe") return { type: "staff", nom, initiales: "" };
  const ini = nom.includes("@") ? nom.slice(0, 2).toUpperCase() : initiales(nom);
  return { type: l.acteur_type, nom, initiales: ini || "B" };
}

function evenementDe(l: Ligne, c: Contextes, personnes: Map<string, string | null>, aujourdhui: string): Evenement {
  const genre = l.genres[0] ?? "dossier";
  const ph = phraseDe(l.src, l.d, { id: l.id, dossierId: l.dossier_id, requestId: l.request_id, acteurType: l.acteur_type });
  // Une ligne du fil d'un dossier : l'icône suit son type.
  // Une ligne du fil d'un dossier, un geste du journal (hors suppression et envoi) : l'icône suit son type.
  const parType = l.src === "activite" || (l.src === "journal" && ph.icone === "horloge");
  const habit = parType ? habillageActivite(l.genres.find((g) => g !== "suppression") ?? genre, String(l.d.libelle ?? ""), genre === "suppression") : { icone: ph.icone, ton: ph.ton };
  const dossier = l.dossier_id != null ? c.dossiers.find((d) => d.id === l.dossier_id) : null;
  const demande = l.request_id ? c.demandes.find((d) => d.id === l.request_id) : null;
  const espace = l.ec_dossier_id ? c.espaces.find((d) => d.id === l.ec_dossier_id) : null;
  const contexte: Evenement["contexte"] = dossier
    ? { libelle: dossier.ref, sous: nomClient(dossier) || null, href: `/dossiers/${dossier.id}` }
    : demande
      ? { libelle: "Demande", sous: [demande.client_nom, [demande.depart, demande.arrivee].filter(Boolean).join(" → ")].filter(Boolean).join(" · ") || null, href: `/dashboard/${demande.id}` }
      : espace
        ? { libelle: espace.reference, sous: nomClient(espace) || espace.email, href: espace.crm ? `/dossiers/${espace.crm}` : `/dashboard/espace-client/dossiers/${espace.id}` }
        : l.dossier_id != null
          ? { libelle: `Dossier n° ${l.dossier_id}`, sous: "supprimé", href: `/feed?objet=d${l.dossier_id}` }
          : null;
  const lien = ph.lien && ph.lien.href !== contexte?.href ? ph.lien : null;
  const jour = jourParis(l.quand);
  return {
    cle: `${l.src}:${l.id}`,
    src: l.src,
    id: l.id,
    quand: l.quand.toISOString(),
    jour,
    jourLibelle: libelleJour(jour, aujourdhui),
    jourSous: jour === aujourdhui || libelleJour(jour, aujourdhui) === "Hier" ? dateLongue(jour) : null,
    heure: l.sans_heure ? null : HEURE.format(l.quand),
    cote: l.cote,
    genre,
    icone: habit.icone,
    ton: habit.ton,
    texte: ph.texte,
    acteur: acteurDe(l, personnes),
    statut: ph.statut ?? null,
    contexte,
    lien,
  };
}

export async function lireFeed(f: Filtres, curseur: Curseur | null, limite = PAR_PAGE): Promise<{ evenements: Evenement[]; suite: Curseur | null }> {
  const { sql, params } = requetePage(f, limite, curseur);
  const lignes = await q<Ligne>(sql, params);
  const page = lignes.slice(0, limite);
  const c = await contextes(page);
  const personnes = new Map(c.personnes.map((p) => [p.email, p.nom]));
  const aujourdhui = jourParis();
  const evenements = page.map((l) => evenementDe(l, c, personnes, aujourdhui));
  const dernier = page[page.length - 1];
  return { evenements, suite: lignes.length > limite && dernier ? { quand: dernier.quand.toISOString(), cle: `${dernier.src}:${dernier.id}` } : null };
}

export async function compterFeed(f: Filtres): Promise<Record<Vue, number>> {
  const { sql, params } = requeteComptes(f);
  const rows = await q<{ cote: Cote; n: number }>(sql, params);
  const n = (c: Cote) => rows.find((r) => r.cote === c)?.n ?? 0;
  return { tout: n("client") + n("staff") + n("les_deux"), client: n("client") + n("les_deux"), staff: n("staff") + n("les_deux") };
}

// ── Les listes des filtres ───────────────────────────────────────────────────────────────────

export interface Option {
  valeur: string;
  libelle: string;
}

/** Les membres de l'équipe (le CRM, puis l'espace équipe), et les dossiers et demandes les plus récemment actifs. */
export async function optionsFeed(objetCourant: { valeur: string; libelle: string } | null): Promise<{ personnes: Option[]; objets: Option[] }> {
  const r = await q1<{ personnes: { email: string; nom: string }[]; dossiers: { id: number; ref: string; societe: string | null; prenom: string | null; nom: string | null }[]; demandes: { id: string; client_nom: string | null; depart: string | null; arrivee: string | null }[] }>(
    `select
       (select coalesce(jsonb_agg(p order by p.nom), '[]') from (
          select distinct on (email) email, nom from (
            select lower(u.email) as email, u.nom, 1 as rang from crm.utilisateurs u where u.email is not null
            union all
            select lower(m.email), coalesce(nullif(btrim(m.nom), ''), m.email), 2 from public.team_members m where m.actif and m.email is not null
          ) t order by email, rang) p) as personnes,
       (select coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'ref', d.ref, 'societe', c.societe, 'prenom', c.prenom, 'nom', c.nom) order by d.maj_le desc), '[]')
          from (select * from crm.dossiers where archive_le is null order by maj_le desc limit 30) d join crm.clients c on c.id = d.client_id) as dossiers,
       (select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'client_nom', r.client_nom, 'depart', r.depart_ville, 'arrivee', r.arrivee_ville) order by r.created_at desc), '[]')
          from (select * from public.requests order by created_at desc limit 20) r) as demandes`,
  );
  const objets: Option[] = [
    ...(r?.dossiers ?? []).map((d) => ({ valeur: `d${d.id}`, libelle: `Dossier ${d.ref} · ${nomClient(d)}` })),
    ...(r?.demandes ?? []).map((d) => ({
      valeur: `r${d.id}`,
      libelle: `Demande · ${d.client_nom || "client inconnu"}${d.depart || d.arrivee ? ` (${[d.depart, d.arrivee].filter(Boolean).join(" → ")})` : ""}`,
    })),
  ];
  if (objetCourant && !objets.some((o) => o.valeur === objetCourant.valeur)) objets.unshift(objetCourant);
  return {
    personnes: [...(r?.personnes ?? []).map((p) => ({ valeur: p.email, libelle: p.nom })), { valeur: "auto", libelle: "Automatique" }],
    objets,
  };
}

// ── Le détail d'un événement, lu au clic ─────────────────────────────────────────────────────

export interface Detail {
  lignes: { libelle: string; valeur: string }[];
  /** Un extrait d'un message (reçu ou envoyé), seulement ici, jamais dans la liste. */
  extrait: { titre: string; texte: string } | null;
  liens: { href: string; libelle: string }[];
}

const CLES: Record<string, string> = {
  numero: "Numéro",
  montant: "Montant",
  libelle: "Libellé",
  statut: "Statut",
  nom: "Nom",
  email: "E-mail",
  objet: "Objet",
  sujet: "Objet",
  destinataire: "Destinataire",
  canal: "Canal",
  modele: "Modèle",
  motif: "Motif",
  reference: "Référence",
  origine: "Origine",
  regle: "Règle",
  formule: "Formule",
  titre: "Titre",
  date: "Date",
  debut: "Début",
  trajet: "Trajet",
  prestataire: "Prestataire",
  client: "Client",
  ref: "Dossier",
  fonction: "Fonction",
  role: "Rôle",
  categorie: "Catégorie",
  fichier: "Fichier",
  plan: "Plan",
  colonne: "Colonne",
  type: "Type",
  nb: "Nombre",
  total: "Total",
  resume: "Résumé",
  envoye_le: "Envoyé le",
  signe_le: "Signé le",
  emise_le: "Émise le",
  echeance: "Échéance",
  payee_le: "Payée le",
  date_souhaitee: "Date souhaitée",
  volume: "Volume",
  montant_estimation: "Estimation",
  expediteur: "Expéditeur",
  tentatives: "Tentatives",
  genre: "Genre",
  samedi: "Samedi",
  demo: "Démonstration",
  destinataires: "Destinataires",
  alerte: "Alerte",
  mode: "Mode",
  nature: "Nature",
  potentiel: "Potentiel",
  difficulte: "Difficulté",
  manque: "Il manque",
};
const PRIVES = new Set(["corps", "message", "texte", "apercu", "token", "jeton", "mot_de_passe"]);

function valeurLisible(cle: string, v: unknown): string | null {
  if (v == null || v === "") return null;
  if (typeof v === "boolean") return v ? "oui" : "non";
  if (cle === "canal") return v === "sms" ? "SMS" : v === "email" ? "E-mail" : String(v);
  if (typeof v === "number") return cle.includes("montant") || cle === "total" || cle === "ttc" ? eur(v) : cle.includes("volume") ? m3(v) : String(v);
  if (Array.isArray(v)) return v.map((x) => (typeof x === "object" ? JSON.stringify(x) : String(x))).join(", ") || null;
  if (typeof v === "object") return null;
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return new Date(`${s}T12:00:00Z`).toLocaleDateString("fr-FR", { dateStyle: "long", timeZone: "UTC" });
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return new Date(s).toLocaleString("fr-FR", { timeZone: "Europe/Paris", dateStyle: "medium", timeStyle: "short" });
  return s.length > 240 ? `${s.slice(0, 240)}…` : s;
}

/** Les champs d'un objet en lignes lisibles (les textes de message exceptés). */
function lignesDe(o: Record<string, unknown>, sauf: string[] = []): Detail["lignes"] {
  const out: Detail["lignes"] = [];
  for (const [k, v] of Object.entries(o)) {
    if (PRIVES.has(k) || sauf.includes(k) || k.endsWith("_id") || k === "id") continue;
    const val = valeurLisible(k, v);
    if (val) out.push({ libelle: CLES[k] ?? k.charAt(0).toUpperCase() + k.slice(1).replace(/_/g, " "), valeur: val });
  }
  return out;
}

const extrait = (titre: string, texte: string | null | undefined, max = 500): Detail["extrait"] =>
  texte?.trim() ? { titre, texte: texte.trim().length > max ? `${texte.trim().slice(0, max)}…` : texte.trim() } : null;

export async function lireDetail(src: string, id: string): Promise<Detail | null> {
  const source = SOURCES.find((s) => s.cle === src);
  if (!source || !/^[\w-]{1,64}$/.test(id)) return null;
  const l = await q1<Ligne>(`select * from (${source.sql}) as s(${COLONNES}) where s.id = $1 limit 1`, [id]);
  if (!l) return null;
  const d = l.d ?? {};
  const liens: Detail["liens"] = [];
  if (l.dossier_id) liens.push({ href: `/feed?objet=d${l.dossier_id}`, libelle: "Tout le fil de ce dossier" });
  else if (l.request_id) liens.push({ href: `/feed?objet=r${l.request_id}`, libelle: "Tout le fil de cette demande" });

  switch (src) {
    case "demande": {
      const r = await q1<Record<string, unknown>>(
        `select r.source::text as origine, r.status::text as statut, r.client_nom as client, concat_ws(' → ', nullif(concat_ws(' ', r.depart_code_postal, r.depart_ville), ''),
                nullif(concat_ws(' ', r.arrivee_code_postal, r.arrivee_ville), '')) as trajet, r.date_souhaitee::text as date_souhaitee,
                r.volume_m3::float8 as volume, r.formule, r.estimation_prix::float8 as montant_estimation,
                (select e.corps from public.emails_recus e where e.request_id = r.id order by e.created_at limit 1) as corps
           from public.requests r where r.id = $1`,
        [id],
      );
      if (!r) return null;
      return { lignes: lignesDe({ ...r, origine: r.origine === "email" ? "E-mail" : "Formulaire du site" }), extrait: extrait("Début de l’e-mail du client", r.corps as string), liens };
    }
    case "courriel": {
      const r = await q1<{ expediteur: string; sujet: string; corps: string | null }>("select expediteur, sujet, corps from public.emails_recus where id = $1", [id]);
      return r ? { lignes: lignesDe({ expediteur: r.expediteur, sujet: r.sujet }), extrait: extrait("Début de l’e-mail", r.corps), liens } : null;
    }
    case "envoi": {
      const r = await q1<Record<string, unknown>>(
        "select canal, origine, modele, destinataire, sujet, statut, motif, reference, tentatives, apercu from public.envois where id = $1",
        [id],
      );
      if (!r) return null;
      return {
        lignes: lignesDe({ ...r, statut: issueEnvoi(r.statut as string)?.libelle ?? r.statut }),
        extrait: r.canal === "sms" ? extrait("Texte du SMS", r.apercu as string) : null,
        liens: [...liens, { href: "/dashboard/envois", libelle: "Journal des envois" }],
      };
    }
    case "notif": {
      const r = await q1<{ canal: string; modele: string; destinataire: string; sujet: string | null; statut: string; erreur: string | null; message: string | null }>(
        "select canal, modele, destinataire, sujet, statut, erreur, payload->>'message' as message from public.ec_notifications where id = $1",
        [id],
      );
      if (!r) return null;
      return {
        lignes: lignesDe({ canal: r.canal, modele: MODELES_MESSAGE[r.modele] ?? r.modele, destinataire: r.destinataire, sujet: r.sujet, statut: issueEnvoi(String(d.statut))?.libelle ?? r.statut, motif: d.motif }),
        extrait: r.modele === "message_conseiller" ? extrait("Message du client", r.message) : null,
        liens,
      };
    }
    case "mail": {
      const r = await q1<{ destinataire: string; sujet: string; template: string | null; status: string; erreur: string | null; corps: string | null }>(
        "select destinataire, sujet, template, status::text as status, erreur, corps from public.emails where id = $1",
        [id],
      );
      if (!r) return null;
      return {
        lignes: lignesDe({ destinataire: r.destinataire, sujet: r.sujet, modele: r.template, statut: issueEnvoi(r.status)?.libelle ?? r.status, motif: r.erreur }),
        extrait: extrait("Début du message", r.corps, 400),
        liens,
      };
    }
    case "evt": {
      const p = await q1<{ payload: Record<string, unknown> }>("select payload from public.request_events where id = $1", [id]);
      const pl = p?.payload ?? {};
      const lignes = Array.isArray(pl.lines)
        ? (pl.lines as { label: string; detail: string; note: number }[]).map((x) => ({ libelle: x.label, valeur: `${x.detail} · ${x.note}/100` }))
        : Array.isArray(pl.rempli)
          ? (pl.rempli as { champ: string; valeur: string }[]).map((x) => ({ libelle: x.champ, valeur: String(x.valeur) }))
          : lignesDe(pl, ["lines", "rempli"]);
      if (typeof pl.par === "string") lignes.push({ libelle: "Par", valeur: pl.par });
      return { lignes, extrait: typeof pl.note === "string" ? extrait("Note", pl.note) : null, liens };
    }
    case "journal": {
      const j = await q1<{ action: string; objet_type: string | null; objet_id: string | null; details: Record<string, unknown>; acteur_email: string | null; acteur_nom: string | null }>(
        "select action, objet_type, objet_id, details, acteur_email, acteur_nom from crm.journal where id = $1",
        [id],
      );
      if (!j) return null;
      const lignes = lignesDe({ ...j.details, statut: j.details?.statut ? (issueEnvoi(String(j.details.statut))?.libelle ?? j.details.statut) : undefined });
      if (j.acteur_nom || j.acteur_email) lignes.push({ libelle: "Par", valeur: [j.acteur_nom, j.acteur_email].filter(Boolean).join(" · ") });
      return { lignes, extrait: null, liens };
    }
    case "activite":
      return { lignes: [{ libelle: "Au fil du dossier", valeur: String(d.libelle ?? "") }], extrait: null, liens };
    case "facture": {
      const f = await q1<Record<string, unknown>>(
        `select numero, objet, montant::float8 as montant, statut, genre, emise_le::text as emise_le, echeance_le::text as echeance, payee_le::text as payee_le
           from crm.factures where id = $1`,
        [Number(id)],
      );
      return f ? { lignes: lignesDe(f), extrait: null, liens } : null;
    }
    case "devis_envoye":
    case "devis_signe": {
      const v = await q1<Record<string, unknown>>(
        "select numero, formule, titre, montant::float8 as montant, statut, envoye_le, signe_le from crm.devis where id = $1",
        [Number(id)],
      );
      if (!v) return null;
      if (l.dossier_id) liens.unshift({ href: `/dossiers/${l.dossier_id}/devis/${id}`, libelle: "Ouvrir le devis" });
      return { lignes: lignesDe({ ...v, envoye_le: v.envoye_le ? (v.envoye_le as Date).toISOString() : null, signe_le: v.signe_le ? (v.signe_le as Date).toISOString() : null }), extrait: null, liens };
    }
    // Le suivi d'un e-mail (src/crm/suivi) : sa piste entière, étape par étape, et ce que vaut la mesure.
    case "ouverture":
    case "clic": {
      const envoiId = id.slice(2, 38);
      const s = (await suiviDesEnvois([envoiId])).get(envoiId);
      const lignes = [
        ...lignesDe({ sujet: d.sujet, destinataire: d.destinataire, reference: d.reference }),
        ...(s ? etapesPiste(s).map((e) => ({ libelle: e.libelle, valeur: e.titre.replace(` ${MESURE_INDICATIVE}`, "") })) : []),
      ];
      return { lignes, extrait: { titre: "Ce que vaut la mesure", texte: MESURE_INDICATIVE }, liens: [...liens, { href: "/dashboard/envois", libelle: "Journal des envois" }] };
    }
    case "portail":
      return {
        lignes: [
          ...((d.pages ?? []) as string[]).length ? [{ libelle: "Pages vues", valeur: (d.pages as string[]).map(libellePage).join(", ") }] : [],
          ...((d.gestes ?? []) as string[]).length ? [{ libelle: "Gestes", valeur: (d.gestes as string[]).map(libellePage).join(", ") }] : [],
          ...(d.reference ? [{ libelle: "Référence", valeur: String(d.reference) }] : []),
          { libelle: "Venu d'un e-mail", valeur: d.depuis_email ? "oui (lien suivi)" : "non, ou pas mesuré" },
        ],
        extrait: null,
        liens,
      };
    case "commentaire": {
      const c = await q1<{ auteur: string; texte: string }>("select auteur, texte from crm.conteneur_commentaires where id = $1", [Number(id)]);
      return c ? { lignes: [{ libelle: "Auteur", valeur: c.auteur }], extrait: extrait("Commentaire", c.texte), liens } : null;
    }
    default:
      return { lignes: lignesDe(d), extrait: null, liens };
  }
}
