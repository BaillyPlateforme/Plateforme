"use server";
import { redirect } from "next/navigation";
import { q, q1, transaction } from "@/crm/lib/db";
import { currentUser } from "@/crm/lib/auth";
import { journaliser } from "@/crm/lib/journal";
import { ident, journal, rafraichir, texte } from "@/crm/exploitation/commun";
import { refuse, reussi, type Resultat } from "@/crm/exploitation/ui/resultat";
import { estCategorie, zonesDe } from "./categories";

/*
 * Les actions de l'annuaire des sous-traitants et partenaires. Chacune
 * vérifie la session (une action serveur s'appelle depuis n'importe quelle
 * adresse). Renommer une société renomme aussi le prestataire des lettres de
 * voiture qui lui sont reliées : le lien et le texte restent d'accord.
 */

function champs(f: FormData) {
  const categorie = texte(f, "categorie");
  return {
    nom: texte(f, "nom", 120),
    categorie: estCategorie(categorie) ? categorie : "sous_traitant",
    siret: texte(f, "siret", 40),
    adresse: texte(f, "adresse", 240),
    code_postal: texte(f, "code_postal", 12),
    ville: texte(f, "ville", 80),
    pays: texte(f, "pays", 60),
    telephone: texte(f, "telephone", 40),
    email: texte(f, "email", 160),
    site: texte(f, "site", 200),
    zones: zonesDe(texte(f, "zones", 1200)),
    notes: texte(f, "notes", 4000),
  };
}

const doublon = (e: unknown) => /idx_sous_traitants_nom|duplicate key/i.test(String((e as Error)?.message ?? e));

export async function creerPartenaire(f: FormData): Promise<Resultat> {
  await currentUser();
  const c = champs(f);
  if (!c.nom) return refuse("Le nom de la société est obligatoire.");
  if (c.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(c.email)) return refuse("L'adresse e-mail n'est pas valide.");
  let id: number;
  try {
    const r = await q1<{ id: number }>(
      `insert into sous_traitants(nom,categorie,siret,adresse,code_postal,ville,pays,telephone,email,site,zones,notes)
       values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) returning id`,
      [c.nom, c.categorie, c.siret, c.adresse, c.code_postal, c.ville, c.pays, c.telephone, c.email, c.site, c.zones, c.notes],
    );
    id = r!.id;
  } catch (e) {
    if (doublon(e)) return refuse(`« ${c.nom} » est déjà dans l'annuaire.`);
    throw e;
  }
  // Le premier contact, s'il a été saisi avec la société.
  const contact = texte(f, "contact_nom", 120);
  if (contact) {
    await q("insert into sous_traitant_contacts(sous_traitant_id,nom,fonction,telephone,email,principal) values($1,$2,$3,$4,$5,true)", [
      id, contact, texte(f, "contact_fonction", 80), texte(f, "contact_telephone", 40), texte(f, "contact_email", 160),
    ]);
  }
  // Les lettres de voiture déjà saisies à ce nom s'y relient d'elles-mêmes.
  await q("update lettres_voiture set prestataire = prestataire where sous_traitant_id is null and lower(btrim(prestataire)) = lower(btrim($1))", [c.nom]);
  rafraichir("/partenaires");
  await journaliser({ action: "partenaire.cree", libelle: `Partenaire « ${c.nom} » ajouté à l'annuaire`, objet: { type: "partenaire", id }, details: { nom: c.nom, categorie: c.categorie, ville: c.ville } });
  if (f.get("ouvrir") === "1") redirect(`/partenaires/${id}`);
  return reussi(`${c.nom} ajouté à l'annuaire.`, id);
}

export async function majPartenaire(id: number, f: FormData): Promise<Resultat> {
  await currentUser();
  const c = champs(f);
  if (!c.nom) return refuse("Le nom de la société est obligatoire.");
  if (c.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(c.email)) return refuse("L'adresse e-mail n'est pas valide.");
  let ancien = c.nom;
  try {
    await transaction(async (db) => {
      const [avant] = await db.query<{ nom: string }>("select nom from sous_traitants where id=$1 for update", [id]);
      if (!avant) throw new Error("introuvable");
      ancien = avant.nom;
      await db.query(
        `update sous_traitants set nom=$2,categorie=$3,siret=$4,adresse=$5,code_postal=$6,ville=$7,pays=$8,telephone=$9,email=$10,site=$11,zones=$12,notes=$13,
           actif=$14, maj_le=now() where id=$1`,
        [id, c.nom, c.categorie, c.siret, c.adresse, c.code_postal, c.ville, c.pays, c.telephone, c.email, c.site, c.zones, c.notes, f.get("actif") !== "non"],
      );
      // Le nom a changé : les lettres reliées suivent (le texte imprimé reste celui de l'annuaire).
      if (avant.nom !== c.nom) await db.query("update lettres_voiture set prestataire=$2 where sous_traitant_id=$1", [id, c.nom]);
    });
  } catch (e) {
    if (doublon(e)) return refuse(`Une autre fiche porte déjà le nom « ${c.nom} ».`);
    if ((e as Error).message === "introuvable") return refuse("Cette fiche n'existe plus.");
    throw e;
  }
  rafraichir("/partenaires", `/partenaires/${id}`);
  await journaliser({
    action: "partenaire.modifie",
    libelle: ancien !== c.nom ? `Fiche partenaire « ${ancien} » modifiée (devient « ${c.nom} »)` : `Fiche partenaire « ${c.nom} » modifiée`,
    objet: { type: "partenaire", id },
    details: { nom: c.nom, ancien_nom: ancien !== c.nom ? ancien : null, categorie: c.categorie, actif: f.get("actif") !== "non" },
  });
  return reussi("Fiche enregistrée.");
}

/** Supprime une fiche. Les lettres et litiges reliés gardent leur texte ; seul le lien disparaît. */
export async function supprimerPartenaire(id: number): Promise<Resultat> {
  await currentUser();
  const p = await q1<{ nom: string; categorie: string; ville: string | null }>("delete from sous_traitants where id=$1 returning nom, categorie, ville", [id]);
  rafraichir("/partenaires");
  if (p) await journaliser({ action: "partenaire.supprime", libelle: `Partenaire « ${p.nom} » supprimé de l'annuaire`, objet: { type: "partenaire", id }, details: { nom: p.nom, categorie: p.categorie, ville: p.ville } });
  redirect("/partenaires?ok=supprime");
}

/* ---------- contacts ---------- */
export async function ajouterContact(id: number, f: FormData): Promise<Resultat> {
  await currentUser();
  const nom = texte(f, "nom", 120);
  if (!nom) return refuse("Le nom du contact est obligatoire.");
  const email = texte(f, "email", 160);
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return refuse("L'adresse e-mail n'est pas valide.");
  const principal = f.get("principal") === "on";
  await transaction(async (db) => {
    if (principal) await db.query("update sous_traitant_contacts set principal=false where sous_traitant_id=$1", [id]);
    await db.query("insert into sous_traitant_contacts(sous_traitant_id,nom,fonction,telephone,email,principal) values($1,$2,$3,$4,$5,$6)", [
      id, nom, texte(f, "fonction", 80), texte(f, "telephone", 40), email, principal,
    ]);
  });
  rafraichir(`/partenaires/${id}`);
  return reussi(`${nom} ajouté.`);
}

export async function majContact(id: number, contact: number, f: FormData): Promise<Resultat> {
  await currentUser();
  const nom = texte(f, "nom", 120);
  if (!nom) return refuse("Le nom du contact est obligatoire.");
  const email = texte(f, "email", 160);
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return refuse("L'adresse e-mail n'est pas valide.");
  const principal = f.get("principal") === "on";
  await transaction(async (db) => {
    if (principal) await db.query("update sous_traitant_contacts set principal=false where sous_traitant_id=$1", [id]);
    await db.query("update sous_traitant_contacts set nom=$3,fonction=$4,telephone=$5,email=$6,principal=$7 where id=$2 and sous_traitant_id=$1", [
      id, contact, nom, texte(f, "fonction", 80), texte(f, "telephone", 40), email, principal,
    ]);
  });
  rafraichir(`/partenaires/${id}`);
  return reussi("Contact enregistré.");
}

export async function supprimerContact(id: number, contact: number): Promise<Resultat> {
  await currentUser();
  const c = await q1<{ nom: string; fonction: string | null; societe: string | null }>(
    "delete from sous_traitant_contacts k where k.id=$2 and k.sous_traitant_id=$1 returning k.nom, k.fonction, (select nom from sous_traitants where id = k.sous_traitant_id) as societe",
    [id, contact],
  );
  rafraichir(`/partenaires/${id}`);
  if (c) await journaliser({ action: "contact_partenaire.supprime", libelle: `Contact ${c.nom} retiré de la fiche partenaire « ${c.societe ?? ""} »`, objet: { type: "contact_partenaire", id: contact }, details: { nom: c.nom, fonction: c.fonction, partenaire: c.societe, partenaire_id: id } });
  return reussi("Contact retiré.");
}

/**
 * Le prestataire d'une lettre de voiture choisi dans l'annuaire (liste des
 * lettres) : le lien et le nom imprimé. Sans société choisie, la lettre
 * garde son texte libre et perd seulement le lien.
 */
export async function affecterPrestataire(lettre: number, f: FormData): Promise<Resultat> {
  const u = await currentUser();
  const sid = ident(f.get("sous_traitant_id"));
  const l = await q1<{ dossier_id: number; numero: string }>("select dossier_id, numero from lettres_voiture where id=$1", [lettre]);
  if (!l) return refuse("Cette lettre de voiture n'existe plus.");
  if (sid) {
    const s = await q1<{ nom: string }>("select nom from sous_traitants where id=$1", [sid]);
    if (!s) return refuse("Cette société n'est plus dans l'annuaire.");
    await q("update lettres_voiture set prestataire=$2, sous_traitant_id=$3 where id=$1", [lettre, s.nom, sid]);
    await journal(l.dossier_id, u.id, `Lettre ${l.numero} : prestataire ${s.nom} (annuaire)`);
  } else {
    await q("update lettres_voiture set sous_traitant_id=null where id=$1", [lettre]);
  }
  rafraichir("/lettres-de-voiture", `/dossiers/${l.dossier_id}`);
  return reussi("Prestataire enregistré.");
}
