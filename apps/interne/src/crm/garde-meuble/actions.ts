"use server";
import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { q, q1, transaction, type Db } from "@/crm/lib/db";
import { currentUser } from "@/crm/lib/auth";
import { nomClient } from "@/crm/lib/format";
import { ecrireReglage, ident, jour, journal, nombre, rafraichir, texte } from "@/crm/exploitation/commun";
import { refuse, reussi, type Resultat } from "@/crm/exploitation/ui/resultat";
import { assurerSeau, deposer, retirerFichiers, typeImage } from "@/terrain/lib/photos";
import { PLAFOND_PHOTO } from "@/terrain/regles";
import { deplier, estPeriodicite, numeroContrat, resumer } from "./regles";

/*
 * Les actions du garde-meuble : créer, modifier, clore, rouvrir ou supprimer
 * un contrat ; ses caisses une par une (numéro, contenu, emplacement, entrée,
 * sortie) et leurs photos, facultatives.
 *
 * Le nombre de caisses et la ligne des numéros du contrat (colonnes
 * nb_caisses et numeros, lues par la liste et la facture) sont tenus à jour
 * depuis les caisses présentes.
 *
 * Les photos vont dans le seau privé des photos du CRM (« photos-chantier »,
 * celui de l'outil terrain et des visites), sous garde-meuble/<contrat>/ ;
 * elles ne sortent que par /api/garde-meuble/photos/<id>, qui vérifie la
 * session.
 */

type Champs = {
  dossierId: number | null;
  client: string | null;
  loyer: number | null;
  periodicite: string;
  debut: string | null | "invalide";
  echeance: string | null | "invalide";
  assurance: boolean;
  notes: string | null;
};

function lire(f: FormData): Champs {
  const p = texte(f, "periodicite");
  return {
    dossierId: ident(f.get("dossier_id")),
    client: texte(f, "client", 160),
    loyer: nombre(f, "loyer"),
    periodicite: estPeriodicite(p) ? p : "mensuelle",
    debut: jour(f, "debut"),
    echeance: jour(f, "echeance"),
    assurance: f.get("assurance") !== "non",
    notes: texte(f, "notes", 4000),
  };
}

function verifier(c: Champs): string | null {
  if (!c.client && !c.dossierId) return "Choisissez un dossier ou indiquez le nom du client.";
  if (c.loyer == null) return "Le loyer mensuel est obligatoire : aucun tarif n'est supposé.";
  if (Number.isNaN(c.loyer) || c.loyer < 0 || c.loyer > 1_000_000) return "Le loyer mensuel n'est pas un montant valide.";
  if (!c.debut) return "La date de début est obligatoire.";
  if (c.debut === "invalide") return "La date de début n'est pas valide.";
  if (c.echeance === "invalide") return "La date d'échéance n'est pas valide.";
  if (c.echeance && c.echeance < c.debut) return "La première échéance ne peut pas précéder le début du contrat.";
  return null;
}

/** Le nom du client : celui saisi, sinon celui du dossier choisi. */
async function nomDuClient(c: Champs) {
  if (c.client) return c.client;
  const d = await q1<{ nom: string; prenom: string | null; societe: string | null }>(
    "select c.nom,c.prenom,c.societe from dossiers d join clients c on c.id=d.client_id where d.id=$1",
    [c.dossierId],
  );
  return d ? nomClient(d) : null;
}

/** Remet le nombre et le résumé des numéros du contrat d'accord avec ses caisses présentes (s'il en a). */
async function resynchroniser(db: Db, contrat: number) {
  const k = await db.query<{ numero: string }>("select numero from garde_meuble_caisses where contrat_id=$1 and sortie_le is null order by ordre, id", [contrat]);
  const toutes = await db.query<{ n: number }>("select count(*)::int as n from garde_meuble_caisses where contrat_id=$1", [contrat]);
  if (!toutes[0].n) return;
  await db.query("update garde_meuble set nb_caisses=$2, numeros=$3, maj_le=now() where id=$1", [contrat, k.length, resumer(k.map((x) => x.numero)) || null]);
}

/** Les photos jointes à un formulaire (champ `nom`), vérifiées : images seulement, 15 Mo au plus chacune. */
async function photosDu(f: FormData, nom: string) {
  const fichiers = f.getAll(nom).filter((x): x is File => x instanceof File && x.size > 0);
  const out: { donnees: Buffer; type: string; ext: string; taille: number }[] = [];
  for (const fi of fichiers.slice(0, 12)) {
    if (fi.size > PLAFOND_PHOTO) throw new Error(`La photo « ${fi.name} » dépasse 15 Mo.`);
    const donnees = Buffer.from(await fi.arrayBuffer());
    const t = typeImage(donnees);
    if (!t) throw new Error(`« ${fi.name} » n'est pas une photo (JPEG, PNG, WebP ou HEIC).`);
    out.push({ donnees, type: t.type, ext: t.ext, taille: fi.size });
  }
  return out;
}

async function enregistrerPhotos(contrat: number, caisse: number, photos: Awaited<ReturnType<typeof photosDu>>, auteur: string) {
  if (!photos.length) return;
  await assurerSeau();
  for (const p of photos) {
    const chemin = `garde-meuble/${contrat}/${caisse}/${randomUUID()}.${p.ext}`;
    await deposer(chemin, p.donnees, p.type);
    await q("insert into garde_meuble_photos(caisse_id,chemin,type,taille,auteur) values($1,$2,$3,$4,$5)", [caisse, chemin, p.type, p.taille, auteur]);
  }
}

/* ---------- contrat ---------- */

/**
 * Le nouveau contrat (/garde-meuble/nouveau) : ses caisses viennent des
 * lignes du formulaire (caisse_<i>_numero, _contenu, _emplacement, et les
 * photos caisse_<i>_photos), à défaut de la ligne des numéros.
 */
export async function creerContrat(f: FormData): Promise<Resultat> {
  const u = await currentUser();
  const c = lire(f);
  const erreur = verifier(c);
  if (erreur) return refuse(erreur);
  const client = await nomDuClient(c);
  if (!client) return refuse("Ce dossier n'existe plus : choisissez-en un autre ou indiquez le nom du client.");

  // Les caisses, une par ligne ; sinon la ligne des numéros dépliée.
  const lignes: { numero: string; contenu: string | null; emplacement: string | null; i: number }[] = [];
  const indices = [...new Set([...f.keys()].map((k) => /^caisse_(\d+)_numero$/.exec(k)?.[1]).filter((x): x is string => !!x).map(Number))].sort((a, b) => a - b);
  for (const i of indices.slice(0, 500)) {
    const numero = texte(f, `caisse_${i}_numero`, 40);
    if (numero) lignes.push({ numero, contenu: texte(f, `caisse_${i}_contenu`, 300), emplacement: texte(f, `caisse_${i}_emplacement`, 80), i });
  }
  if (!lignes.length) for (const n of deplier(texte(f, "numeros", 4000))) lignes.push({ numero: n, contenu: null, emplacement: null, i: -1 });
  const doublons = lignes.map((l) => l.numero.toLowerCase()).filter((n, i, t) => t.indexOf(n) !== i);
  if (doublons.length) return refuse(`Le numéro de caisse « ${doublons[0]} » est saisi deux fois.`);
  const nb = lignes.length || Math.max(0, Math.round(nombre(f, "nb_caisses") ?? 0));
  if (!nb) return refuse("Indiquez au moins une caisse (leur nombre ou leurs numéros).");

  let photos: Map<number, Awaited<ReturnType<typeof photosDu>>>;
  try {
    photos = new Map(await Promise.all(lignes.filter((l) => l.i >= 0).map(async (l) => [l.i, await photosDu(f, `caisse_${l.i}_photos`)] as const)));
  } catch (e) {
    return refuse((e as Error).message);
  }

  const { id, caisses } = await transaction(async (db) => {
    const [g] = await db.query<{ id: number }>(
      `insert into garde_meuble(dossier_id,client,nb_caisses,numeros,loyer_mensuel,periodicite,debut,echeance,assurance,notes,cree_le,maj_le)
       values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now(),now()) returning id`,
      [c.dossierId, client, nb, lignes.length ? resumer(lignes.map((l) => l.numero)) : texte(f, "numeros", 400), c.loyer, c.periodicite, c.debut, c.echeance, c.assurance, c.notes],
    );
    const ids: { i: number; id: number }[] = [];
    for (const [ordre, l] of lignes.entries()) {
      const [k] = await db.query<{ id: number }>(
        "insert into garde_meuble_caisses(contrat_id,numero,contenu,emplacement,entree_le,ordre) values($1,$2,$3,$4,$5,$6) returning id",
        [g.id, l.numero, l.contenu, l.emplacement, c.debut, ordre],
      );
      ids.push({ i: l.i, id: k.id });
    }
    return { id: g.id, caisses: ids };
  });
  try {
    for (const k of caisses) await enregistrerPhotos(id, k.id, photos.get(k.i) ?? [], u.nom);
  } catch (e) {
    console.error("Garde-meuble : dépôt des photos", e);
    await journal(c.dossierId, u.id, `Contrat de garde-meuble ${numeroContrat(id)} créé (${nb} caisse${nb > 1 ? "s" : ""}) · photos non enregistrées`);
    rafraichir("/garde-meuble");
    redirect(`/garde-meuble/${id}?ok=photos`);
  }
  await journal(c.dossierId, u.id, `Contrat de garde-meuble ${numeroContrat(id)} créé (${nb} caisse${nb > 1 ? "s" : ""})`);
  rafraichir("/garde-meuble");
  redirect(`/garde-meuble/${id}?ok=cree`);
}

export async function majContrat(id: number, f: FormData): Promise<Resultat> {
  const u = await currentUser();
  const c = lire(f);
  const erreur = verifier(c);
  if (erreur) return refuse(erreur);
  const client = await nomDuClient(c);
  if (!client) return refuse("Indiquez le nom du client.");
  const avant = await q1<{ dossier_id: number | null; caisses: number }>(
    "select dossier_id, (select count(*)::int from garde_meuble_caisses where contrat_id=g.id) as caisses from garde_meuble g where id=$1",
    [id],
  );
  if (!avant) return refuse("Ce contrat n'existe plus.");
  // Sans caisses détaillées, le nombre et les numéros se saisissent encore à la main.
  const nb = avant.caisses ? null : Math.max(1, Math.round(nombre(f, "nb_caisses") ?? 1));
  await q(
    `update garde_meuble set dossier_id=$2, client=$3, loyer_mensuel=$4, periodicite=$5, debut=$6, echeance=$7, assurance=$8, notes=$9,
       nb_caisses=coalesce($10, nb_caisses), numeros=case when $10::int is null then numeros else $11 end, maj_le=now() where id=$1`,
    [id, c.dossierId, client, c.loyer, c.periodicite, c.debut, c.echeance, c.assurance, c.notes, nb, texte(f, "numeros", 400)],
  );
  await journal(c.dossierId ?? avant.dossier_id, u.id, `Contrat de garde-meuble ${numeroContrat(id)} modifié`);
  rafraichir("/garde-meuble", `/garde-meuble/${id}`);
  return reussi("Contrat enregistré.");
}

/** Clore un contrat : il quitte la facturation ; ses caisses encore présentes sont sorties à la date de fin. */
export async function cloreContrat(id: number, f: FormData): Promise<Resultat> {
  const u = await currentUser();
  const fin = jour(f, "fin");
  if (fin === "invalide") return refuse("La date de fin n'est pas valide.");
  const date = fin ?? new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Paris" });
  const g = await q1<{ dossier_id: number | null; debut: Date }>("select dossier_id, debut from garde_meuble where id=$1", [id]);
  if (!g) return refuse("Ce contrat n'existe plus.");
  if (date < g.debut.toISOString().slice(0, 10)) return refuse("La fin ne peut pas précéder le début du contrat.");
  await transaction(async (db) => {
    await db.query("update garde_meuble set actif=false, fin=$2, maj_le=now() where id=$1", [id, date]);
    await db.query("update garde_meuble_caisses set sortie_le=$2 where contrat_id=$1 and sortie_le is null", [id, date]);
  });
  await journal(g.dossier_id, u.id, `Contrat de garde-meuble ${numeroContrat(id)} clos`);
  rafraichir("/garde-meuble", `/garde-meuble/${id}`);
  return reussi("Contrat clos.");
}

export async function rouvrirContrat(id: number): Promise<Resultat> {
  const u = await currentUser();
  const g = await q1<{ dossier_id: number | null }>("update garde_meuble set actif=true, fin=null, maj_le=now() where id=$1 returning dossier_id", [id]);
  if (!g) return refuse("Ce contrat n'existe plus.");
  await journal(g.dossier_id, u.id, `Contrat de garde-meuble ${numeroContrat(id)} rouvert`);
  rafraichir("/garde-meuble", `/garde-meuble/${id}`);
  return reussi("Contrat rouvert. Les caisses sorties le restent : rentrez-les une à une au besoin.");
}

/** Supprimer un contrat : seulement s'il n'a aucune facture (sinon, on le clôt). */
export async function supprimerContrat(id: number): Promise<Resultat> {
  const u = await currentUser();
  const fact = await q1<{ n: number }>("select count(*)::int as n from factures where garde_meuble_id=$1", [id]);
  if (fact?.n) return refuse("Ce contrat a des factures : il se clôt, il ne se supprime pas.");
  const chemins = await q<{ chemin: string }>("select p.chemin from garde_meuble_photos p join garde_meuble_caisses k on k.id=p.caisse_id where k.contrat_id=$1", [id]);
  const g = await q1<{ dossier_id: number | null }>("delete from garde_meuble where id=$1 returning dossier_id", [id]);
  await retirerFichiers(chemins.map((c) => c.chemin)).catch((e) => console.error("Garde-meuble : retrait des photos", e));
  if (g) await journal(g.dossier_id, u.id, `Contrat de garde-meuble ${numeroContrat(id)} supprimé`);
  rafraichir("/garde-meuble");
  redirect("/garde-meuble?ok=supprime");
}

/* ---------- caisses ---------- */

export async function ajouterCaisses(contrat: number, f: FormData): Promise<Resultat> {
  const u = await currentUser();
  const numeros = deplier(texte(f, "numeros", 4000));
  if (!numeros.length) return refuse("Indiquez le ou les numéros des caisses (« GM-0720 », ou « GM-0720 à GM-0725 »).");
  const entree = jour(f, "entree_le");
  if (entree === "invalide") return refuse("La date d'entrée n'est pas valide.");
  const g = await q1<{ dossier_id: number | null; actif: boolean }>("select dossier_id, actif from garde_meuble where id=$1", [contrat]);
  if (!g) return refuse("Ce contrat n'existe plus.");
  const existants = new Set((await q<{ n: string }>("select lower(numero) as n from garde_meuble_caisses where contrat_id=$1", [contrat])).map((x) => x.n));
  const deja = numeros.find((n) => existants.has(n.toLowerCase()));
  if (deja) return refuse(`La caisse ${deja} est déjà sur ce contrat.`);
  let photos: Awaited<ReturnType<typeof photosDu>> = [];
  try {
    photos = numeros.length === 1 ? await photosDu(f, "photos") : [];
  } catch (e) {
    return refuse((e as Error).message);
  }
  const ids = await transaction(async (db) => {
    // Le contrat n'avait que des numéros en texte : ils deviennent des caisses avant l'ajout.
    const [{ n }] = await db.query<{ n: number }>("select count(*)::int as n from garde_meuble_caisses where contrat_id=$1", [contrat]);
    if (!n) {
      const [ancien] = await db.query<{ numeros: string | null; debut: Date }>("select numeros, debut from garde_meuble where id=$1", [contrat]);
      for (const [o, num] of deplier(ancien.numeros).entries())
        if (!numeros.some((x) => x.toLowerCase() === num.toLowerCase()))
          await db.query("insert into garde_meuble_caisses(contrat_id,numero,entree_le,ordre) values($1,$2,$3,$4)", [contrat, num, ancien.debut, o]);
    }
    const [{ m }] = await db.query<{ m: number }>("select coalesce(max(ordre), -1)::int as m from garde_meuble_caisses where contrat_id=$1", [contrat]);
    const out: number[] = [];
    for (const [i, num] of numeros.entries()) {
      const [k] = await db.query<{ id: number }>(
        "insert into garde_meuble_caisses(contrat_id,numero,contenu,emplacement,entree_le,ordre) values($1,$2,$3,$4,coalesce($5::date, current_date),$6) returning id",
        [contrat, num, texte(f, "contenu", 300), texte(f, "emplacement", 80), entree, m + 1 + i],
      );
      out.push(k.id);
    }
    await resynchroniser(db, contrat);
    return out;
  });
  if (photos.length) await enregistrerPhotos(contrat, ids[0], photos, u.nom);
  await journal(g.dossier_id, u.id, `Garde-meuble ${numeroContrat(contrat)} : ${numeros.length > 1 ? `${numeros.length} caisses ajoutées` : `caisse ${numeros[0]} ajoutée`}`);
  rafraichir("/garde-meuble", `/garde-meuble/${contrat}`);
  return reussi(numeros.length > 1 ? `${numeros.length} caisses ajoutées.` : `Caisse ${numeros[0]} ajoutée.`);
}

export async function majCaisse(contrat: number, caisse: number, f: FormData): Promise<Resultat> {
  const u = await currentUser();
  const numero = texte(f, "numero", 40);
  if (!numero) return refuse("Le numéro de la caisse est obligatoire.");
  const entree = jour(f, "entree_le");
  const sortie = jour(f, "sortie_le");
  if (entree === "invalide" || sortie === "invalide") return refuse("Une des dates n'est pas valide.");
  if (entree && sortie && sortie < entree) return refuse("La sortie ne peut pas précéder l'entrée.");
  let photos: Awaited<ReturnType<typeof photosDu>>;
  try {
    photos = await photosDu(f, "photos");
  } catch (e) {
    return refuse((e as Error).message);
  }
  try {
    await transaction(async (db) => {
      const r = await db.query("select 1 from garde_meuble_caisses where contrat_id=$1 and lower(numero)=lower($2) and id<>$3", [contrat, numero, caisse]);
      if (r.length) throw new Error(`doublon:${numero}`);
      await db.query("update garde_meuble_caisses set numero=$3, contenu=$4, emplacement=$5, entree_le=$6, sortie_le=$7 where id=$2 and contrat_id=$1", [
        contrat, caisse, numero, texte(f, "contenu", 300), texte(f, "emplacement", 80), entree, sortie,
      ]);
      await resynchroniser(db, contrat);
    });
  } catch (e) {
    if (String((e as Error).message).startsWith("doublon:")) return refuse(`La caisse ${numero} existe déjà sur ce contrat.`);
    throw e;
  }
  await enregistrerPhotos(contrat, caisse, photos, u.nom);
  rafraichir("/garde-meuble", `/garde-meuble/${contrat}`);
  return reussi(photos.length ? `Caisse enregistrée, ${photos.length} photo${photos.length > 1 ? "s" : ""} ajoutée${photos.length > 1 ? "s" : ""}.` : "Caisse enregistrée.");
}

export async function supprimerCaisse(contrat: number, caisse: number): Promise<Resultat> {
  await currentUser();
  const chemins = await q<{ chemin: string }>("select chemin from garde_meuble_photos where caisse_id=$1", [caisse]);
  await transaction(async (db) => {
    await db.query("delete from garde_meuble_caisses where id=$2 and contrat_id=$1", [contrat, caisse]);
    await resynchroniser(db, contrat);
  });
  await retirerFichiers(chemins.map((c) => c.chemin)).catch((e) => console.error("Garde-meuble : retrait des photos", e));
  rafraichir("/garde-meuble", `/garde-meuble/${contrat}`);
  return reussi("Caisse retirée du contrat.");
}

export async function supprimerPhoto(contrat: number, photo: number): Promise<Resultat> {
  await currentUser();
  const p = await q1<{ chemin: string }>(
    "delete from garde_meuble_photos p using garde_meuble_caisses k where p.id=$2 and k.id=p.caisse_id and k.contrat_id=$1 returning p.chemin",
    [contrat, photo],
  );
  if (p) await retirerFichiers([p.chemin]).catch((e) => console.error("Garde-meuble : retrait d'une photo", e));
  rafraichir(`/garde-meuble/${contrat}`);
  return reussi("Photo retirée.");
}

/* ---------- réglage ---------- */

/** Le loyer mensuel d'une caisse, pour pré-remplir un contrat : vide tant que Bailly ne l'a pas donné. */
export async function reglerLoyerCaisse(f: FormData): Promise<Resultat> {
  const u = await currentUser();
  const v = nombre(f, "loyer_caisse");
  if (v != null && (Number.isNaN(v) || v <= 0)) return refuse("Le loyer d'une caisse doit être un montant positif, ou vide.");
  await ecrireReglage("gm_loyer_caisse", v == null ? null : String(v), u.nom);
  rafraichir("/garde-meuble", "/garde-meuble/nouveau");
  return reussi(v == null ? "Loyer par caisse effacé : le loyer se saisit à chaque contrat." : "Loyer par caisse enregistré.");
}
