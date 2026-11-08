"use server";
import { redirect } from "next/navigation";
import { q, q1, transaction, type Db } from "@/crm/lib/db";
import { currentUser, type User } from "@/crm/lib/auth";
import { journaliser } from "@/crm/lib/journal";
import { heure, ident, jour, journal, nombre, rafraichir, texte } from "@/crm/exploitation/commun";
import { refuse, reussi, type Resultat } from "@/crm/exploitation/ui/resultat";
import { estStatut, JALONS, STATUTS, totaux } from "./regles";

/*
 * Les actions des conteneurs : la création complète (fiche, jalons, coûts,
 * premier commentaire), puis chaque partie de la fiche — identification et
 * transport, jalons prévus et réels, coûts, contenu (clients, ordre, n° FE),
 * commentaires — et la suppression. Chaque changement s'inscrit dans
 * l'historique du conteneur (crm.conteneur_historique).
 */

const CHAMPS = {
  numero: "Numéro",
  sens: "Sens",
  taille: "Type",
  capacite: "Capacité",
  plomb: "Plomb",
  statut: "Statut",
  ref_interne: "Référence interne",
  voyage: "Voyage",
  navire: "Navire",
  compagnie: "Compagnie",
  transitaire: "Transitaire",
  groupeur: "Groupeur",
  degroupeur: "Dégroupeur",
  ref_groupeur: "Réf. groupeur",
  ref_compagnie: "Réf. compagnie",
  ref_transitaire: "Réf. transitaire",
  lieu_depart: "Lieu de départ",
  depart_prevu: "Départ prévu",
  depart_heure: "Heure de départ",
  destination: "Lieu d'arrivée",
  arrivee_prevue: "Arrivée prévue",
  arrivee_heure: "Heure d'arrivée",
} as const;
type Cle = keyof typeof CHAMPS;
type Fiche = Record<Cle, string | number | null>;

function lireFiche(f: FormData): Fiche | string {
  const sens = texte(f, "sens");
  const statut = texte(f, "statut") ?? "preparation";
  const capacite = nombre(f, "capacite");
  const dp = jour(f, "depart_prevu");
  const ap = jour(f, "arrivee_prevue");
  const numero = texte(f, "numero", 40)?.toUpperCase() ?? null;
  if (!numero) return "Le numéro du conteneur est obligatoire.";
  if (sens !== "export" && sens !== "import") return "Choisissez Export ou Import.";
  if (!estStatut(statut)) return "Statut inconnu.";
  if (capacite == null || Number.isNaN(capacite) || capacite <= 0 || capacite > 500) return "La capacité (m³) doit être un nombre positif.";
  if (dp === "invalide" || ap === "invalide") return "Une des dates n'est pas valide.";
  const destination = texte(f, "destination", 160);
  if (!destination) return "Le lieu d'arrivée est obligatoire.";
  return {
    numero, sens, statut, capacite, destination,
    taille: texte(f, "taille", 40) ?? "40 pieds",
    plomb: texte(f, "plomb", 40),
    ref_interne: texte(f, "ref_interne", 60),
    voyage: texte(f, "voyage", 60),
    navire: texte(f, "navire", 80),
    compagnie: texte(f, "compagnie", 120),
    transitaire: texte(f, "transitaire", 120),
    groupeur: texte(f, "groupeur", 120),
    degroupeur: texte(f, "degroupeur", 120),
    ref_groupeur: texte(f, "ref_groupeur", 60),
    ref_compagnie: texte(f, "ref_compagnie", 60),
    ref_transitaire: texte(f, "ref_transitaire", 60),
    lieu_depart: texte(f, "lieu_depart", 160),
    depart_prevu: dp,
    depart_heure: heure(f, "depart_heure"),
    arrivee_prevue: ap,
    arrivee_heure: heure(f, "arrivee_heure"),
  };
}

const COLONNES = Object.keys(CHAMPS) as Cle[];
const doublon = (e: unknown) => /conteneurs_numero_key|duplicate key/i.test(String((e as Error)?.message ?? e));

async function histo(db: Db | null, id: number, u: User, libelle: string) {
  const sql = "insert into conteneur_historique(conteneur_id,utilisateur_id,libelle) values($1,$2,$3)";
  if (db) await db.query(sql, [id, u.id, libelle]);
  else await q(sql, [id, u.id, libelle]);
}

const montrer = (k: Cle, v: string | number | null) => {
  if (v == null || v === "") return "vide";
  if (k === "statut") return STATUTS[v as keyof typeof STATUTS]?.libelle ?? String(v);
  if (k === "sens") return v === "export" ? "Export" : "Import";
  if (k === "depart_prevu" || k === "arrivee_prevue") return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${v}T00:00:00Z`));
  if (k === "depart_heure" || k === "arrivee_heure") return String(v).slice(0, 5);
  return String(v);
};

/** Les jalons du formulaire : jalon_<clé>_prevu et jalon_<clé>_reel. */
function lireJalons(f: FormData): { cle: string; prevu: string | null; reel: string | null }[] | string {
  const out: { cle: string; prevu: string | null; reel: string | null }[] = [];
  for (const j of JALONS) {
    const prevu = jour(f, `jalon_${j.cle}_prevu`);
    const reel = jour(f, `jalon_${j.cle}_reel`);
    if (prevu === "invalide" || reel === "invalide") return `${j.libelle} : une date n'est pas valide.`;
    out.push({ cle: j.cle, prevu, reel });
  }
  return out;
}

type Cout = { id: number | null; libelle: string; fournisseur: string | null; revient_prevu: number | null; revient_reel: number | null; vente_prevue: number | null; vente_reelle: number | null };
/** Les lignes de coûts : cout_<k>_libelle, _fournisseur, _rp, _rr, _vp, _vr (et _id pour une ligne existante). */
function lireCouts(f: FormData): Cout[] | string {
  const indices = [...new Set([...f.keys()].map((k) => /^cout_(\d+)_libelle$/.exec(k)?.[1]).filter((x): x is string => !!x))].sort((a, b) => Number(a) - Number(b));
  const out: Cout[] = [];
  for (const i of indices) {
    const libelle = texte(f, `cout_${i}_libelle`, 120);
    const montants = (["rp", "rr", "vp", "vr"] as const).map((k) => nombre(f, `cout_${i}_${k}`));
    if (!libelle) {
      if (montants.some((m) => m != null)) return "Chaque ligne de coût a besoin d'un libellé.";
      continue;
    }
    if (montants.some((m) => m != null && (Number.isNaN(m) || Math.abs(m) > 10_000_000))) return `« ${libelle} » : un montant n'est pas valide.`;
    out.push({ id: ident(f.get(`cout_${i}_id`)), libelle, fournisseur: texte(f, `cout_${i}_fournisseur`, 120), revient_prevu: montants[0], revient_reel: montants[1], vente_prevue: montants[2], vente_reelle: montants[3] });
  }
  return out;
}

async function ecrireJalons(db: Db, id: number, jalons: { cle: string; prevu: string | null; reel: string | null }[]) {
  for (const j of jalons) {
    if (!j.prevu && !j.reel) await db.query("delete from conteneur_jalons where conteneur_id=$1 and jalon=$2", [id, j.cle]);
    else
      await db.query(
        `insert into conteneur_jalons(conteneur_id,jalon,prevu,reel,maj_le) values($1,$2,$3,$4,now())
         on conflict (conteneur_id,jalon) do update set prevu=excluded.prevu, reel=excluded.reel, maj_le=now()`,
        [id, j.cle, j.prevu, j.reel],
      );
  }
}

/* ---------- création ---------- */

export async function creerConteneur(f: FormData): Promise<Resultat> {
  const u = await currentUser();
  const fiche = lireFiche(f);
  if (typeof fiche === "string") return refuse(fiche);
  const jalons = lireJalons(f);
  if (typeof jalons === "string") return refuse(jalons);
  const couts = lireCouts(f);
  if (typeof couts === "string") return refuse(couts);
  let id: number;
  try {
    id = await transaction(async (db) => {
      const [c] = await db.query<{ id: number }>(
        `insert into conteneurs(${COLONNES.join(",")},cree_le,maj_le) values(${COLONNES.map((_, i) => `$${i + 1}`).join(",")},now(),now()) returning id`,
        COLONNES.map((k) => fiche[k]),
      );
      await ecrireJalons(db, c.id, jalons);
      for (const [o, k] of couts.entries())
        await db.query("insert into conteneur_couts(conteneur_id,libelle,fournisseur,ordre,revient_prevu,revient_reel,vente_prevue,vente_reelle) values($1,$2,$3,$4,$5,$6,$7,$8)", [
          c.id, k.libelle, k.fournisseur, o, k.revient_prevu, k.revient_reel, k.vente_prevue, k.vente_reelle,
        ]);
      const commentaire = texte(f, "commentaire", 4000);
      if (commentaire) await db.query("insert into conteneur_commentaires(conteneur_id,utilisateur_id,auteur,texte) values($1,$2,$3,$4)", [c.id, u.id, u.nom, commentaire]);
      await histo(db, c.id, u, `Conteneur créé (${fiche.sens === "export" ? "export" : "import"}, ${fiche.taille}, vers ${fiche.destination})`);
      return c.id;
    });
  } catch (e) {
    if (doublon(e)) return refuse(`Le conteneur ${fiche.numero} existe déjà.`);
    throw e;
  }
  rafraichir("/conteneurs");
  redirect(`/conteneurs/${id}?ok=cree`);
}

/* ---------- fiche ---------- */

export async function majFicheConteneur(id: number, f: FormData): Promise<Resultat> {
  const u = await currentUser();
  const fiche = lireFiche(f);
  if (typeof fiche === "string") return refuse(fiche);
  try {
    const n = await transaction(async (db) => {
      const [avant] = await db.query<Fiche>(
        `select ${COLONNES.map((k) => (k === "capacite" ? "capacite::float8 as capacite" : k === "depart_prevu" || k === "arrivee_prevue" ? `${k}::text as ${k}` : k === "depart_heure" || k === "arrivee_heure" ? `to_char(${k}, 'HH24:MI') as ${k}` : k)).join(",")} from conteneurs where id=$1 for update`,
        [id],
      );
      if (!avant) throw new Error("introuvable");
      await db.query(`update conteneurs set ${COLONNES.map((k, i) => `${k}=$${i + 2}`).join(",")}, maj_le=now() where id=$1`, [id, ...COLONNES.map((k) => fiche[k])]);
      const changes = COLONNES.filter((k) => String(avant[k] ?? "") !== String(fiche[k] ?? ""));
      for (const k of changes) await histo(db, id, u, `${CHAMPS[k]} : ${montrer(k, avant[k])} → ${montrer(k, fiche[k])}`);
      return changes.length;
    });
    rafraichir("/conteneurs", `/conteneurs/${id}`);
    return reussi(n ? `Fiche enregistrée (${n} changement${n > 1 ? "s" : ""}).` : "Rien n'a changé.");
  } catch (e) {
    if (doublon(e)) return refuse(`Un autre conteneur porte déjà le numéro ${fiche.numero}.`);
    if ((e as Error).message === "introuvable") return refuse("Ce conteneur n'existe plus.");
    throw e;
  }
}

export async function majJalons(id: number, f: FormData): Promise<Resultat> {
  const u = await currentUser();
  const jalons = lireJalons(f);
  if (typeof jalons === "string") return refuse(jalons);
  const n = await transaction(async (db) => {
    const avant = new Map((await db.query<{ jalon: string; prevu: string | null; reel: string | null }>("select jalon, prevu::text as prevu, reel::text as reel from conteneur_jalons where conteneur_id=$1", [id])).map((j) => [j.jalon, j]));
    await ecrireJalons(db, id, jalons);
    let k = 0;
    for (const j of jalons) {
      const a = avant.get(j.cle);
      const lib = JALONS.find((x) => x.cle === j.cle)!.libelle;
      for (const quoi of ["prevu", "reel"] as const) {
        if ((a?.[quoi] ?? null) === j[quoi]) continue;
        k++;
        await histo(db, id, u, `${lib} ${quoi === "prevu" ? "prévu" : "réel"} : ${j[quoi] ? montrer("depart_prevu", j[quoi]) : "effacé"}`);
      }
    }
    if (k) await db.query("update conteneurs set maj_le=now() where id=$1", [id]);
    return k;
  });
  rafraichir("/conteneurs", `/conteneurs/${id}`);
  return reussi(n ? `Jalons enregistrés (${n} date${n > 1 ? "s" : ""}).` : "Rien n'a changé.");
}

export async function majCouts(id: number, f: FormData): Promise<Resultat> {
  const u = await currentUser();
  const couts = lireCouts(f);
  if (typeof couts === "string") return refuse(couts);
  await transaction(async (db) => {
    const gardes = couts.map((c) => c.id).filter((x): x is number => !!x);
    await db.query("delete from conteneur_couts where conteneur_id=$1 and not (id = any($2::int[]))", [id, gardes]);
    for (const [o, c] of couts.entries()) {
      const v = [c.libelle, c.fournisseur, o, c.revient_prevu, c.revient_reel, c.vente_prevue, c.vente_reelle];
      if (c.id) await db.query("update conteneur_couts set libelle=$3,fournisseur=$4,ordre=$5,revient_prevu=$6,revient_reel=$7,vente_prevue=$8,vente_reelle=$9 where id=$2 and conteneur_id=$1", [id, c.id, ...v]);
      else await db.query("insert into conteneur_couts(conteneur_id,libelle,fournisseur,ordre,revient_prevu,revient_reel,vente_prevue,vente_reelle) values($1,$2,$3,$4,$5,$6,$7,$8)", [id, ...v]);
    }
    const t = totaux(couts);
    const eur = (n: number | null) => (n == null ? "—" : `${Math.round(n).toLocaleString("fr-FR")} €`);
    await histo(db, id, u, `Coûts enregistrés (${couts.length} ligne${couts.length > 1 ? "s" : ""}) · marge prévue ${eur(t.margePrevue)} · réalisée ${eur(t.margeReelle)}`);
    await db.query("update conteneurs set maj_le=now() where id=$1", [id]);
  });
  rafraichir("/conteneurs", `/conteneurs/${id}`);
  return reussi("Coûts enregistrés.");
}

/* ---------- contenu ---------- */

async function nomDossier(dossier: number) {
  const r = await q1<{ ref: string; nom: string }>("select d.ref, coalesce(c.societe, concat_ws(' ', c.prenom, c.nom)) as nom from dossiers d join clients c on c.id=d.client_id where d.id=$1", [dossier]);
  return r ? `${r.nom} (${r.ref})` : `dossier ${dossier}`;
}

export async function ajouterClient(id: number, f: FormData): Promise<Resultat> {
  const u = await currentUser();
  const dossier = ident(f.get("dossier_id"));
  if (!dossier) return refuse("Choisissez un dossier.");
  const volume = nombre(f, "volume");
  if (volume == null || Number.isNaN(volume) || volume < 0) return refuse("Indiquez le volume (m³) du client dans ce conteneur.");
  const r = await q1<{ id: number }>(
    `insert into conteneur_dossiers(conteneur_id,dossier_id,volume,ville_livraison,numero_fe,rang)
     values($1,$2,$3,$4,$5,(select coalesce(max(rang),-1)+1 from conteneur_dossiers where conteneur_id=$1)) on conflict do nothing returning id`,
    [id, dossier, volume, texte(f, "ville", 80), texte(f, "numero_fe", 40)],
  );
  if (!r) return refuse("Ce dossier est déjà dans le conteneur.");
  const nom = await nomDossier(dossier);
  await histo(null, id, u, `Client ajouté : ${nom}, ${volume} m³`);
  await journal(dossier, u.id, "Ajouté à un conteneur");
  rafraichir("/conteneurs", `/conteneurs/${id}`);
  return reussi(`${nom} ajouté.`);
}

export async function majClient(id: number, ligne: number, f: FormData): Promise<Resultat> {
  const u = await currentUser();
  const volume = nombre(f, "volume");
  if (volume == null || Number.isNaN(volume) || volume < 0) return refuse("Le volume doit être un nombre positif.");
  const r = await q1<{ dossier_id: number }>("update conteneur_dossiers set volume=$3, ville_livraison=$4, numero_fe=$5 where id=$2 and conteneur_id=$1 returning dossier_id", [
    id, ligne, volume, texte(f, "ville", 80), texte(f, "numero_fe", 40),
  ]);
  if (!r) return refuse("Cette ligne n'existe plus.");
  await histo(null, id, u, `Client modifié : ${await nomDossier(r.dossier_id)}, ${volume} m³`);
  rafraichir("/conteneurs", `/conteneurs/${id}`);
  return reussi("Ligne enregistrée.");
}

/** Monter (-1) ou descendre (+1) un client dans l'ordre du conteneur. */
export async function deplacerClient(id: number, ligne: number, sens: -1 | 1): Promise<Resultat> {
  await currentUser();
  await transaction(async (db) => {
    const l = await db.query<{ id: number }>("select id from conteneur_dossiers where conteneur_id=$1 order by rang, id for update", [id]);
    const i = l.findIndex((x) => x.id === ligne);
    const j = i + sens;
    if (i < 0 || j < 0 || j >= l.length) return;
    [l[i], l[j]] = [l[j], l[i]];
    for (const [r, x] of l.entries()) await db.query("update conteneur_dossiers set rang=$2 where id=$1", [x.id, r]);
  });
  rafraichir(`/conteneurs/${id}`);
  return reussi();
}

export async function retirerClient(id: number, ligne: number): Promise<Resultat> {
  const u = await currentUser();
  const r = await q1<{ dossier_id: number; volume: number; numero: string | null }>(
    "delete from conteneur_dossiers cd where cd.id=$2 and cd.conteneur_id=$1 returning cd.dossier_id, cd.volume::float8 as volume, (select numero from conteneurs where id = cd.conteneur_id) as numero",
    [id, ligne],
  );
  if (r) {
    const nom = await nomDossier(r.dossier_id);
    await histo(null, id, u, `Client retiré : ${nom}`);
    await journal(r.dossier_id, u.id, "Retiré d'un conteneur");
    await journaliser({
      action: "conteneur_client.retire", libelle: `Client retiré du conteneur ${r.numero ?? ""} : ${nom}`, objet: { type: "conteneur", id }, dossierId: r.dossier_id,
      details: { conteneur: r.numero, client: nom, volume: r.volume }, activite: "Retiré d'un conteneur",
    });
  }
  rafraichir("/conteneurs", `/conteneurs/${id}`);
  return reussi("Client retiré.");
}

/* ---------- commentaires ---------- */

export async function commenter(id: number, f: FormData): Promise<Resultat> {
  const u = await currentUser();
  const t = texte(f, "texte", 4000);
  if (!t) return refuse("Le commentaire est vide.");
  await q("insert into conteneur_commentaires(conteneur_id,utilisateur_id,auteur,texte) values($1,$2,$3,$4)", [id, u.id, u.nom, t]);
  rafraichir(`/conteneurs/${id}`);
  return reussi("Commentaire ajouté.");
}

export async function supprimerCommentaire(id: number, commentaire: number): Promise<Resultat> {
  await currentUser();
  const c = await q1<{ auteur: string; numero: string | null; cree_le: Date }>(
    "delete from conteneur_commentaires k where k.id=$2 and k.conteneur_id=$1 returning k.auteur, k.cree_le, (select numero from conteneurs where id = k.conteneur_id) as numero",
    [id, commentaire],
  );
  rafraichir(`/conteneurs/${id}`);
  // Le texte du commentaire n'est pas recopié : seulement son auteur et sa date.
  if (c) await journaliser({ action: "commentaire_conteneur.supprime", libelle: `Commentaire de ${c.auteur} supprimé (conteneur ${c.numero ?? ""})`, objet: { type: "commentaire_conteneur", id: commentaire }, details: { conteneur: c.numero, conteneur_id: id, auteur: c.auteur, ecrit_le: new Date(c.cree_le).toISOString() } });
  return reussi("Commentaire supprimé.");
}

/* ---------- suppression ---------- */

export async function supprimerConteneur(id: number): Promise<Resultat> {
  await currentUser();
  // Son historique (conteneur_historique) part avec lui : seul le journal des gestes garde la suppression.
  const c = await q1<{ numero: string; sens: string; destination: string; statut: string; clients: number }>(
    "delete from conteneurs k where k.id=$1 returning k.numero, k.sens, k.destination, k.statut, (select count(*)::int from conteneur_dossiers where conteneur_id = k.id) as clients",
    [id],
  );
  if (c) await journaliser({ action: "conteneur.supprime", libelle: `Conteneur ${c.numero} (${c.destination}) supprimé`, objet: { type: "conteneur", id }, details: { numero: c.numero, sens: c.sens, destination: c.destination, statut: c.statut, clients: c.clients } });
  rafraichir("/conteneurs", "/conteneurs/dispatch");
  redirect("/conteneurs?ok=supprime");
}
